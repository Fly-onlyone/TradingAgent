"""Per-article strategy extractor — pure compute, no AgentSession.

Wraps the existing `StrategyExtractor` (dual-mode Anthropic/SDK client)
and returns an `ExtractionResult`. Matches the existing TechnicalAnalyst
/ FundamentalAnalyst / NewsAnalyst pattern: subagents do work and return
dicts; only the parent (the Explorer in our case) owns an `AgentSession`.

Why no per-extractor session: spawning N AgentSession rows per cycle
(one per article) clutters the chat sidebar and doesn't match the rest
of the codebase. The Explorer's session captures the delegation cards
(via `record_delegation`) and that is the user's single navigation target.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.services.strategy_extractor import (
    ExtractedStrategy,
    StrategyExtractor,
)

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """Output of one extractor run."""

    extracted: ExtractedStrategy | None
    confidence: float
    error: str | None = None


class StrategyExtractorAgent:
    """Extract one article into an `ExtractedStrategy`. No session, no recorder."""

    def __init__(
        self,
        *,
        article_url: str,
        article_title: str,
        article_content: str,
    ) -> None:
        self.article_url = article_url
        self.article_title = article_title
        self.article_content = article_content
        self._extractor: StrategyExtractor | None = None

    async def run(self) -> ExtractionResult:
        try:
            self._extractor = await StrategyExtractor.create()
        except Exception as exc:
            logger.debug("Extractor init failed", exc_info=True)
            return ExtractionResult(extracted=None, confidence=0.0, error=str(exc))

        try:
            extracted = await self._extractor.extract_from_text(
                self.article_content, source_hint=self.article_url
            )
        except Exception as exc:
            logger.debug("Extraction failed for %s", self.article_url, exc_info=True)
            return ExtractionResult(extracted=None, confidence=0.0, error=str(exc))

        validation_error = self._validate(extracted)
        confidence = self._score_confidence(extracted)

        if validation_error is not None:
            return ExtractionResult(
                extracted=None,
                confidence=confidence,
                error=validation_error,
            )
        return ExtractionResult(extracted=extracted, confidence=confidence)

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
