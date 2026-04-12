"""Per-article strategy extractor subagent.

Wraps the existing `StrategyExtractor` (dual-mode Anthropic/SDK client)
but runs inside its own `AgentSession` so users can open the chat log
in the existing viewer. One subagent == one `ClaudeSDKClient` process
== one article, spawned in parallel by the Explorer orchestrator.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from beanie import PydanticObjectId

from app.agent.session_recorder import (
    AgentSessionRecorder,
    create_subagent_session,
)
from app.db.models.agent_session import AgentSession
from app.services.strategy_extractor import (
    MAX_CONTENT_LENGTH,
    ExtractedStrategy,
    StrategyExtractor,
)

SessionCreatedCallback = Callable[[PydanticObjectId], Awaitable[None]]

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """Output of one extractor subagent run."""

    session_id: PydanticObjectId
    extracted: ExtractedStrategy | None
    confidence: float
    # When extraction failed or produced no usable strategy, extracted is None
    # and error holds a short reason — used for the delegation status chip.
    error: str | None = None


class StrategyExtractorAgent:
    """Extract one article into an `ExtractedStrategy` with full session persistence."""

    def __init__(
        self,
        *,
        user_id: PydanticObjectId,
        article_url: str,
        article_title: str,
        article_content: str,
    ) -> None:
        self.user_id = user_id
        self.article_url = article_url
        self.article_title = article_title
        self.article_content = article_content
        self._extractor: StrategyExtractor | None = None
        self.session: AgentSession | None = None

    async def run(
        self,
        on_session_created: SessionCreatedCallback | None = None,
    ) -> ExtractionResult:
        """Create a session, call the extractor, persist the chat, return result.

        `on_session_created` fires as soon as the `AgentSession` is inserted
        so the orchestrator can emit a "running" delegation card in the
        parent Explorer chat before the (potentially slow) Claude call.
        """
        title = f"Strategy Extract — {self.article_title[:80]}"
        self.session = await create_subagent_session(
            user_id=self.user_id,
            title=title,
            description=self.article_url,
        )
        if on_session_created is not None:
            try:
                await on_session_created(self.session.id)
            except Exception:
                logger.debug("on_session_created hook failed", exc_info=True)  # non-fatal
        recorder = AgentSessionRecorder(self.session)

        try:
            self._extractor = await StrategyExtractor.create()
        except Exception as exc:
            await recorder.record_system_note(f"Extractor init failed: {exc}")
            await recorder.end()
            return ExtractionResult(
                session_id=self.session.id,
                extracted=None,
                confidence=0.0,
                error=str(exc),
            )

        preview = self.article_content[:MAX_CONTENT_LENGTH]
        word_count = len(preview.split())
        user_prompt = (
            f"Extract the trading strategy from this article.\n\n"
            f"Source: {self.article_url}\n"
            f"Title: {self.article_title}\n"
            f"Word count: {word_count}\n\n"
            f"---\n{preview}"
        )
        await recorder.record_user_message(user_prompt)

        try:
            extracted = await self._extractor.extract_from_text(
                self.article_content, source_hint=self.article_url
            )
        except Exception as exc:
            logger.debug("Extraction failed for %s", self.article_url, exc_info=True)
            await recorder.record_system_note(f"Extraction failed: {exc}")
            await recorder.end()
            return ExtractionResult(
                session_id=self.session.id,
                extracted=None,
                confidence=0.0,
                error=str(exc),
            )

        # Validation: reject placeholder/incomplete results — same gate as the
        # legacy `_extract_and_save`. Confidence is a coarse heuristic when the
        # extractor doesn't surface one explicitly: structured fields present.
        validation_error = self._validate(extracted)
        confidence = self._score_confidence(extracted)

        # Persist a summary assistant message + a save_strategy tool_call so
        # the extractor's own chat page shows the structured output.
        await recorder.attach_tool_result(
            tool_name="save_strategy",
            tool_input={
                "name": extracted.name,
                "description": extracted.description,
            },
            result=extracted.model_dump(mode="json"),
            summary=(
                f"{extracted.name} — confidence {confidence:.2f}"
                if validation_error is None
                else f"rejected: {validation_error}"
            ),
        )
        await recorder.end()

        if validation_error is not None:
            return ExtractionResult(
                session_id=self.session.id,
                extracted=None,
                confidence=confidence,
                error=validation_error,
            )

        return ExtractionResult(
            session_id=self.session.id,
            extracted=extracted,
            confidence=confidence,
        )

    # ------------------------------------------------------------------
    # Validation + confidence heuristics
    # ------------------------------------------------------------------

    @staticmethod
    def _validate(extracted: ExtractedStrategy) -> str | None:
        if not extracted.name or extracted.name == "Imported Strategy":
            return "missing_name"
        if not extracted.entry_rules:
            return "missing_entry_rules"
        return None

    @staticmethod
    def _score_confidence(extracted: ExtractedStrategy) -> float:
        """Coarse 0..1 score based on field completeness.

        The underlying Claude `save_strategy` tool does not emit a confidence
        number, so we synthesize one from how many structured fields were
        actually filled in. Callers compare this against
        `AppSettings.auto_discover_min_confidence`.
        """
        score = 0.0
        score += 0.25 if extracted.name and extracted.name != "Imported Strategy" else 0.0
        score += 0.15 if len(extracted.description) >= 40 else 0.05
        score += 0.20 if extracted.entry_rules else 0.0
        score += 0.15 if extracted.exit_rules else 0.0
        score += 0.10 if extracted.risk_params else 0.0
        score += 0.05 if extracted.timeframes else 0.0
        score += 0.05 if extracted.symbols or extracted.asset_classes else 0.0
        score += 0.05 if extracted.market_conditions else 0.0
        return round(min(score, 1.0), 2)
