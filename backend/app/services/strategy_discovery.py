"""Auto-discovery of trading strategies via Explorer + parallel Extractor subagents.

Phases per cycle:

1. Open a `StrategyDiscoveryCycle` document for bookkeeping + UI linkage.
2. Run `StrategyExplorerAgent` — an agentic scout that picks Brave queries,
   crawls results, filters against `has_been_extracted`, and emits a list
   of candidate articles.
3. Fetch the body of each candidate via `article_fetcher`.
4. Fan out one `StrategyExtractorAgent` subagent per article, capped by
   `asyncio.Semaphore(auto_discover_max_parallel_extractions)`.
5. Dedup parallel results, filter by `auto_discover_min_confidence`, save
   each survivor as `StrategyKnowledge` + embedding + notification.

Every Explorer + Extractor subagent owns its own `AgentSession`; the
Explorer session additionally records `delegate_to_extractor` tool_call
messages so the chat viewer shows the fan-out visually.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from beanie import PydanticObjectId

from app.agent.session_recorder import AgentSessionRecorder
from app.agent.subagents.strategy_explorer import (
    ArticleCandidate,
    StrategyExplorerAgent,
)
from app.agent.subagents.strategy_extractor_agent import (
    ExtractionResult,
    StrategyExtractorAgent,
)
from app.db.models.agent_session import AgentSession
from app.db.models.app_settings import AppSettings
from app.db.models.knowledge import StrategyKnowledge
from app.db.models.notification import NotificationType
from app.db.models.strategy_discovery_cycle import (
    DiscoveryCycleStatus,
    StrategyDiscoveryCycle,
)
from app.db.models.user import User
from app.knowledge.embeddings import StrategyEmbeddingGenerator
from app.services.article_fetcher import fetch_article
from app.services.notification_service import NotificationService
from app.services.strategy_dedup import (
    ExtractionEvidence,
    MergedExtraction,
    merge_extractions,
)

logger = logging.getLogger(__name__)


ProgressCallback = Callable[[dict], Awaitable[None]]


class StrategyDiscoveryService:
    """Orchestrates one end-to-end auto-discovery cycle."""

    def __init__(self) -> None:
        self.embedding_gen = StrategyEmbeddingGenerator()
        self.notification_service = NotificationService()

    async def run_discovery_cycle(
        self,
        on_progress: ProgressCallback | None = None,
        user_id: PydanticObjectId | None = None,
        *,
        manual: bool = False,
    ) -> dict:
        """Run one full discovery cycle and return summary stats.

        `user_id` scopes the subagent sessions. When omitted, the first
        superuser is used so scheduled runs still produce viewable chats.
        """
        app_settings = await AppSettings.get_instance()
        min_confidence = app_settings.auto_discover_min_confidence
        max_candidates = max(1, app_settings.auto_discover_max_candidates)
        max_parallel = max(1, app_settings.auto_discover_max_parallel_extractions)

        async def emit(event: dict) -> None:
            if on_progress:
                await on_progress(event)

        session_user_id = await self._resolve_session_user_id(user_id)
        if session_user_id is None:
            msg = "No user available to own Explorer/Extractor sessions"
            logger.warning(msg)
            return {
                "candidates_found": 0,
                "strategies_saved": 0,
                "strategies_skipped_low_confidence": 0,
                "strategies_failed": 0,
                "error": msg,
            }

        cycle = StrategyDiscoveryCycle(
            manual=manual,
            triggered_by_user_id=user_id if manual else None,
        )
        await cycle.insert()
        await emit({"step": "cycle_started", "cycle_id": str(cycle.id)})

        stats: dict = {
            "cycle_id": str(cycle.id),
            "candidates_found": 0,
            "strategies_saved": 0,
            "strategies_skipped_low_confidence": 0,
            "strategies_failed": 0,
        }

        # Phase 1 — Explorer
        explorer = StrategyExplorerAgent(
            user_id=session_user_id,
            max_candidates=max_candidates,
            cycle_id=cycle.id,
        )
        explorer_result = await explorer.run()

        cycle.explorer_session_id = explorer_result.session_id
        stats["explorer_session_id"] = str(explorer_result.session_id)

        if explorer_result.error is not None:
            cycle.status = DiscoveryCycleStatus.FAILED
            cycle.error = explorer_result.error
            cycle.ended_at = datetime.now(UTC)
            await cycle.save()
            stats["error"] = explorer_result.error
            await emit({"step": "cycle_failed", "error": explorer_result.error})
            return stats

        candidates = explorer_result.candidates[:max_candidates]
        cycle.candidates_found = len(candidates)
        stats["candidates_found"] = len(candidates)
        await cycle.save()
        await emit({"step": "candidates_ready", "count": len(candidates)})

        if not candidates:
            cycle.status = DiscoveryCycleStatus.OK
            cycle.ended_at = datetime.now(UTC)
            await cycle.save()
            return stats

        # Phase 2 — fetch + fan out extractors in parallel
        explorer_session = await AgentSession.get(explorer_result.session_id)
        explorer_recorder = AgentSessionRecorder(explorer_session) if explorer_session else None

        semaphore = asyncio.Semaphore(max_parallel)
        tasks = [
            asyncio.create_task(
                self._process_candidate(
                    candidate=candidate,
                    user_id=session_user_id,
                    semaphore=semaphore,
                    explorer_recorder=explorer_recorder,
                )
            )
            for candidate in candidates
        ]

        extraction_results: list[tuple[ArticleCandidate, ExtractionResult | None]] = []
        for task in asyncio.as_completed(tasks):
            try:
                candidate, result = await task
            except Exception as exc:
                logger.exception("Extractor task crashed")
                await emit({"step": "extractor_error", "error": str(exc)})
                stats["strategies_failed"] += 1
                continue
            extraction_results.append((candidate, result))
            if result and result.session_id:
                if result.session_id not in cycle.extractor_session_ids:
                    cycle.extractor_session_ids.append(result.session_id)
                await cycle.save()

        # Phase 3 — dedup + min-confidence filter
        evidences: list[ExtractionEvidence] = []
        for candidate, result in extraction_results:
            if result is None:
                stats["strategies_failed"] += 1
                continue
            if result.extracted is None:
                if result.error in {"skipped_low_confidence"}:
                    stats["strategies_skipped_low_confidence"] += 1
                else:
                    stats["strategies_failed"] += 1
                continue
            if result.confidence < min_confidence:
                stats["strategies_skipped_low_confidence"] += 1
                continue
            evidences.append(
                ExtractionEvidence(
                    extracted=result.extracted,
                    confidence=result.confidence,
                    source_url=candidate.url,
                    source_session_id=result.session_id,
                    article_title=candidate.title,
                )
            )

        merged = merge_extractions(evidences)
        await emit({"step": "dedup_complete", "merged": len(merged)})

        # Phase 4 — persist survivors
        for merged_extraction in merged:
            saved = await self._save_strategy(
                merged_extraction,
                user_id=user_id,
            )
            if saved is not None:
                stats["strategies_saved"] += 1
                await emit(
                    {
                        "step": "strategy_saved",
                        "name": saved.name,
                        "source_session_id": str(saved.source_session_id)
                        if saved.source_session_id
                        else None,
                    }
                )

        cycle.strategies_saved = stats["strategies_saved"]
        cycle.strategies_skipped_low_confidence = stats["strategies_skipped_low_confidence"]
        cycle.strategies_failed = stats["strategies_failed"]
        cycle.status = DiscoveryCycleStatus.OK
        cycle.ended_at = datetime.now(UTC)
        await cycle.save()
        await emit({"step": "cycle_complete", "stats": stats})

        logger.info("Strategy discovery cycle complete: %s", stats)
        return stats

    # ------------------------------------------------------------------
    # Per-candidate pipeline (runs under the concurrency semaphore)
    # ------------------------------------------------------------------

    async def _process_candidate(
        self,
        *,
        candidate: ArticleCandidate,
        user_id: PydanticObjectId,
        semaphore: asyncio.Semaphore,
        explorer_recorder: AgentSessionRecorder | None,
    ) -> tuple[ArticleCandidate, ExtractionResult | None]:
        async with semaphore:
            fetched = await fetch_article(candidate.url, title=candidate.title)
            if fetched.error or not fetched.content:
                # Fetch failed — surface a failed delegation card with no
                # clickable session link (no Extractor session exists yet).
                if explorer_recorder is not None:
                    await explorer_recorder.record_delegation(
                        child_session_id=None,
                        article_url=candidate.url,
                        article_title=candidate.title,
                        status="failed",
                        detail=f"Fetch failed: {fetched.error}",
                    )
                return candidate, None

            agent = StrategyExtractorAgent(
                user_id=user_id,
                article_url=candidate.url,
                article_title=candidate.title,
                article_content=fetched.content,
            )

            async def announce_running(session_id: PydanticObjectId) -> None:
                if explorer_recorder is None:
                    return
                await explorer_recorder.record_delegation(
                    child_session_id=session_id,
                    article_url=candidate.url,
                    article_title=candidate.title,
                    status="running",
                    detail=(
                        f"Extracting from: {candidate.title}"
                        + (f" — {candidate.reason}" if candidate.reason else "")
                    ),
                )

            try:
                result: ExtractionResult = await agent.run(
                    on_session_created=announce_running,
                )
            except Exception as exc:
                logger.exception("Extractor subagent crashed for %s", candidate.url)
                if explorer_recorder is not None:
                    await explorer_recorder.update_delegation_status(
                        child_session_id=agent.session.id if agent.session else None,
                        article_url=candidate.url,
                        article_title=candidate.title,
                        status="failed",
                        detail=f"Subagent crash: {exc}",
                    )
                return candidate, None

            if explorer_recorder is not None:
                await explorer_recorder.update_delegation_status(
                    child_session_id=result.session_id,
                    article_url=candidate.url,
                    article_title=candidate.title,
                    status=_terminal_status(result),
                    detail=_terminal_detail(result, candidate),
                )

            return candidate, result

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    async def _save_strategy(
        self,
        merged: MergedExtraction,
        *,
        user_id: PydanticObjectId | None,
    ) -> StrategyKnowledge | None:
        extracted = merged.extracted

        # Name dedup against existing DB entries (consistent with legacy).
        existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == extracted.name)
        if existing is not None:
            return None

        knowledge = StrategyKnowledge(
            name=extracted.name,
            description=extracted.description,
            entry_rules=extracted.entry_rules,
            exit_rules=extracted.exit_rules,
            risk_params=extracted.risk_params,
            market_conditions=extracted.market_conditions,
            asset_classes=extracted.asset_classes,
            timeframes=extracted.timeframes,
            source_url=merged.primary_source_url,
            source_session_id=merged.primary_source_session_id,
        )
        await knowledge.insert()

        try:
            knowledge.embedding = await self.embedding_gen.generate_strategy_embedding(
                extracted.model_dump()
            )
            if knowledge.embedding is not None:
                await knowledge.save()
        except Exception:
            logger.warning("Failed to generate embedding for %s", knowledge.id, exc_info=True)

        # Initial rating (best-effort).
        try:
            from app.services.strategy_rating_calculator import (
                StrategyRatingCalculator,
            )

            calculator = StrategyRatingCalculator()
            overall, confidence = await calculator.calculate_overall_rating(knowledge)
            knowledge.overall_rating = overall
            knowledge.rating_confidence = confidence
            await knowledge.save()
        except Exception:
            logger.warning(
                "Failed to calculate initial rating for %s",
                knowledge.id,
                exc_info=True,
            )

        # Inactive Strategy shadow for the Strategies page.
        if user_id is not None:
            from app.db.models.strategy import Strategy

            existing_strategy = await Strategy.find_one(Strategy.name == extracted.name)
            if existing_strategy is None:
                strategy_doc = Strategy(
                    user_id=user_id,
                    name=extracted.name,
                    description=extracted.description,
                    entry_rules=extracted.entry_rules,
                    exit_rules=extracted.exit_rules,
                    risk_params=extracted.risk_params,
                    symbols=extracted.symbols,
                    timeframes=extracted.timeframes,
                    is_active=False,
                    auto_discovered=True,
                    source_url=merged.primary_source_url,
                    knowledge_id=knowledge.id,
                )
                await strategy_doc.insert()

        await self._notify_superusers(knowledge, merged)
        logger.info("Discovered strategy '%s' from %s", knowledge.name, merged.source_urls)
        return knowledge

    async def _notify_superusers(
        self, strategy: StrategyKnowledge, merged: MergedExtraction
    ) -> None:
        superusers = await User.find(User.is_superuser == True).to_list()  # noqa: E712
        body_sources = ", ".join(merged.article_titles[:2]) or merged.primary_source_url
        for user in superusers:
            try:
                await self.notification_service.create_notification(
                    user_id=user.id,
                    title="Strategy Discovered",
                    body=f"New strategy '{strategy.name}' from {body_sources}",
                    notification_type=NotificationType.STRATEGY_DISCOVERED,
                    data={
                        "strategy_knowledge_id": str(strategy.id),
                        "source_url": merged.primary_source_url,
                        "source_session_id": str(merged.primary_source_session_id)
                        if merged.primary_source_session_id
                        else None,
                    },
                )
            except Exception:
                logger.debug("Failed to notify user %s", user.id, exc_info=True)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _resolve_session_user_id(
        preferred: PydanticObjectId | None,
    ) -> PydanticObjectId | None:
        if preferred is not None:
            return preferred
        superuser = await User.find_one(User.is_superuser == True)  # noqa: E712
        return superuser.id if superuser else None


def _terminal_status(result: ExtractionResult) -> str:
    if result.extracted is None:
        return "failed" if result.error not in {"skipped_low_confidence"} else "skipped"
    return "ok"


def _terminal_detail(
    result: ExtractionResult,
    candidate: ArticleCandidate,
) -> str:
    if result.extracted is not None:
        return f"Extracted '{result.extracted.name}' — confidence {result.confidence:.2f}"
    if result.error == "skipped_low_confidence":
        return f"Skipped '{candidate.title}' — low confidence ({result.confidence:.2f})"
    return f"Extraction failed for '{candidate.title}': {result.error or 'unknown error'}"
