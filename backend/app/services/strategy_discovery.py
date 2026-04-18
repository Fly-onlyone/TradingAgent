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
from enum import Enum

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


class DiscoveryBlockReason(str, Enum):
    """Reasons discovery is temporarily blocked.

    The enum value doubles as the progress-event step name so the UI can
    distinguish why a run was skipped.
    """

    EMERGENCY_STOP = "halted_emergency_stop"
    NO_ACTIVE_TASK = "halted_no_active_task"


DISCOVERY_BLOCK_MESSAGES: dict[DiscoveryBlockReason, str] = {
    DiscoveryBlockReason.EMERGENCY_STOP: (
        "Discovery is halted by Emergency Stop — resume all tasks to run"
    ),
    DiscoveryBlockReason.NO_ACTIVE_TASK: (
        "No active trading task — activate a task to run discovery"
    ),
}


async def check_discovery_blocked(
    app_settings: AppSettings | None = None,
) -> DiscoveryBlockReason | None:
    """Return a reason code if discovery must be blocked right now, else None.

    Shared by the periodic-scheduler gate, the `/run-now` SSE endpoint,
    the admin `/run` endpoint, and the belt-and-suspenders check inside
    `run_discovery_cycle` — so every entry point halts with the same
    semantics and the same message.
    """
    # Import here (not module-level) to avoid a cycle through task_scheduler.
    from app.agent.task_scheduler import has_active_trading_task

    if app_settings is None:
        app_settings = await AppSettings.get_instance()
    if app_settings.emergency_stop_active:
        return DiscoveryBlockReason.EMERGENCY_STOP
    if not await has_active_trading_task():
        return DiscoveryBlockReason.NO_ACTIVE_TASK
    return None


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

        # Belt-and-suspenders gate. The scheduler's async `enabled`
        # predicate already blocks the periodic path, but manual triggers
        # (Run Now, admin /run) reach here directly — re-check so nothing
        # slips through. The returned `error` is a skip-sentinel; callers
        # that log stats must not treat it as a failed cycle.
        block = await check_discovery_blocked(app_settings)
        if block is not None:
            await emit({"step": block.value})
            return {
                "candidates_found": 0,
                "strategies_saved": 0,
                "strategies_skipped_low_confidence": 0,
                "strategies_failed": 0,
                "error": DISCOVERY_BLOCK_MESSAGES[block],
            }

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

        try:
            return await self._run_cycle_body(
                cycle=cycle,
                stats=stats,
                emit=emit,
                session_user_id=session_user_id,
                user_id=user_id,
                min_confidence=min_confidence,
                max_candidates=max_candidates,
                max_parallel=max_parallel,
            )
        except Exception as exc:
            # Never leave a cycle row stuck in "running" — otherwise the UI
            # shows ghost active cycles forever.
            logger.exception("Discovery cycle %s crashed", cycle.id)
            try:
                cycle.status = DiscoveryCycleStatus.FAILED
                cycle.error = f"Uncaught exception: {exc}"
                cycle.ended_at = datetime.now(UTC)
                await cycle.save()
            except Exception:
                logger.debug("Failed to finalize crashed cycle", exc_info=True)
            stats["error"] = str(exc)
            await emit({"step": "cycle_failed", "error": str(exc)})
            await self._notify_cycle_failed(
                session_user_id=session_user_id,
                cycle=cycle,
                error=str(exc),
            )
            return stats

    async def _run_cycle_body(
        self,
        *,
        cycle: StrategyDiscoveryCycle,
        stats: dict,
        emit: Callable[[dict], Awaitable[None]],
        session_user_id: PydanticObjectId,
        user_id: PydanticObjectId | None,
        min_confidence: float,
        max_candidates: int,
        max_parallel: int,
    ) -> dict:
        """Inner body of run_discovery_cycle — wrapped in try/except above."""

        # Phase 1 — Explorer
        explorer = StrategyExplorerAgent(
            user_id=session_user_id,
            max_candidates=max_candidates,
            cycle_id=cycle.id,
        )

        async def _on_explorer_session_created(
            session_id: PydanticObjectId,
        ) -> None:
            """Stamp the cycle with the explorer's session id ASAP so the UI
            can navigate into the live chat instead of waiting for run end."""
            cycle.explorer_session_id = session_id
            await cycle.save()
            stats["explorer_session_id"] = str(session_id)
            await emit(
                {
                    "step": "explorer_ready",
                    "explorer_session_id": str(session_id),
                }
            )

        explorer_result = await explorer.run(
            on_session_created=_on_explorer_session_created,
        )

        # Belt-and-suspenders: ensure the id is set even if the callback was
        # somehow skipped (e.g. session creation succeeded but callback raised).
        if cycle.explorer_session_id is None:
            cycle.explorer_session_id = explorer_result.session_id
            stats["explorer_session_id"] = str(explorer_result.session_id)

        if explorer_result.error is not None:
            cycle.status = DiscoveryCycleStatus.FAILED
            cycle.error = explorer_result.error
            cycle.ended_at = datetime.now(UTC)
            await cycle.save()
            stats["error"] = explorer_result.error
            await emit({"step": "cycle_failed", "error": explorer_result.error})
            await self._notify_cycle_failed(
                session_user_id=session_user_id,
                cycle=cycle,
                error=explorer_result.error,
            )
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
            # Clear spinner with a final note.
            explorer_session = await AgentSession.get(explorer_result.session_id)
            if explorer_session is not None:
                await AgentSessionRecorder(explorer_session).record_summary(
                    "✅ Cycle complete — no candidates returned by the Explorer."
                )
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

        # Phase 3 — dedup + min-confidence filter
        evidences: list[ExtractionEvidence] = []
        explorer_sid = cycle.explorer_session_id
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
                    # Saved strategies link back to the Explorer session — the
                    # only chat that exists for this cycle.
                    source_session_id=explorer_sid,
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

        # Final summary message in the Explorer chat — this message clears
        # the "thinking" spinner that the per-extraction broadcasts kept
        # alive across phase 2.
        if explorer_recorder is not None:
            saved = stats["strategies_saved"]
            cands = stats["candidates_found"]
            skipped = stats["strategies_skipped_low_confidence"]
            failed = stats["strategies_failed"]
            await explorer_recorder.record_summary(
                f"✅ Cycle complete — {cands} candidates, {saved} saved"
                + (f", {skipped} skipped (low confidence)" if skipped else "")
                + (f", {failed} failed" if failed else "")
                + "."
            )

        await self._notify_cycle_complete(
            session_user_id=session_user_id,
            cycle=cycle,
            explorer_session_id=cycle.explorer_session_id,
        )

        logger.info("Strategy discovery cycle complete: %s", stats)
        return stats

    async def _notify_cycle_complete(
        self,
        *,
        session_user_id: PydanticObjectId,
        cycle: StrategyDiscoveryCycle,
        explorer_session_id: PydanticObjectId | None,
    ) -> None:
        try:
            from app.db.models.notification import NotificationType

            saved = cycle.strategies_saved
            cands = cycle.candidates_found
            body = (
                f"{saved} new strategies saved from {cands} candidates."
                if saved > 0
                else f"No new strategies — {cands} candidates evaluated."
            )
            await self.notification_service.create_notification(
                user_id=session_user_id,
                title="Strategy Discovery Complete",
                body=body,
                notification_type=NotificationType.TASK_COMPLETED,
                session_id=explorer_session_id,
            )
        except Exception:
            logger.debug("Cycle completion notification failed", exc_info=True)

    async def _notify_cycle_failed(
        self,
        *,
        session_user_id: PydanticObjectId,
        cycle: StrategyDiscoveryCycle,
        error: str,
    ) -> None:
        try:
            from app.db.models.notification import NotificationType

            await self.notification_service.create_notification(
                user_id=session_user_id,
                title="Strategy Discovery Failed",
                body=str(error)[:200],
                notification_type=NotificationType.TASK_FAILED,
                session_id=cycle.explorer_session_id,
            )
        except Exception:
            logger.debug("Cycle failure notification failed", exc_info=True)

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
        del user_id  # extractor no longer owns a session
        async with semaphore:
            # Announce "running" delegation card BEFORE fetching content so
            # the Explorer chat shows progress immediately. We capture the
            # message id so subsequent status updates mutate this same
            # bubble instead of adding new ones.
            message_id: str | None = None
            if explorer_recorder is not None:
                message_id = await explorer_recorder.record_delegation(
                    child_session_id=None,  # no per-extractor session by design
                    article_url=candidate.url,
                    article_title=candidate.title,
                    status="running",
                    detail=(
                        f"Extracting: {candidate.title}"
                        + (f" — {candidate.reason}" if candidate.reason else "")
                    ),
                )

            async def update_status(status: str, detail: str) -> None:
                if explorer_recorder is None or message_id is None:
                    return
                await explorer_recorder.update_delegation_status(
                    message_id=message_id,
                    child_session_id=None,
                    article_url=candidate.url,
                    article_title=candidate.title,
                    status=status,
                    detail=detail,
                )

            fetched = await fetch_article(candidate.url, title=candidate.title)
            if fetched.error or not fetched.content:
                await update_status("failed", f"Fetch failed: {fetched.error}")
                return candidate, None

            agent = StrategyExtractorAgent(
                article_url=candidate.url,
                article_title=candidate.title,
                article_content=fetched.content,
            )

            try:
                result: ExtractionResult = await agent.run()
            except Exception as exc:
                logger.exception("Extractor crashed for %s", candidate.url)
                await update_status("failed", f"Extractor crash: {exc}")
                return candidate, None

            await update_status(
                _terminal_status(result),
                _terminal_detail(result, candidate),
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
