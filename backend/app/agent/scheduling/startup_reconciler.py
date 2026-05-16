"""Startup reconciliation for scheduling-related DB state.

When the app crashes mid-cycle, we leave two kinds of debris:

1. `StrategyDiscoveryCycle` rows stuck in `RUNNING` status.
2. `AgentSession` rows (Explorer/Extractor subagents) stuck with
   `is_active=True`, which pollutes the chat sidebar with "live"
   rows that will never emit another message.

Separately, older discovery runs were invoked without a `user_id`
and so populated only `StrategyKnowledge` rows — their `Strategy`
shadow docs (which the Strategies UI reads) were never created.

This module reconciles both on startup. Moved here from
`AgentTaskScheduler` so the scheduler class keeps its focus on
timing and orchestration.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


class StartupReconciler:
    """Cleans up DB state left behind by a previous crashed process."""

    async def reconcile(self) -> None:
        """Run all startup reconciliation steps. Errors are swallowed per-step."""
        await self._mark_orphaned_discovery_cycles_failed()
        await self._backfill_strategy_shadows()
        await self._mark_orphaned_atk_tool_bubbles_failed()

    async def _mark_orphaned_atk_tool_bubbles_failed(self) -> None:
        """Flip stale ATK tool-call bubbles to a failed `result_summary` (Chat-Session leg 8).

        When the backend crashes mid-turn, an ATK tool-call bubble can be left
        without a `result_summary` and no future event to fill it. This sweep
        runs at startup, scans `AgentSessionMessage` for tool_calls named
        `mcp__okx__*` older than 5 minutes with no result, and sets a synthetic
        error result so the chat bubble doesn't render as 'still running'.
        """
        try:
            from datetime import timedelta

            from app.db.models.agent_session import AgentSessionMessage

            cutoff = datetime.now(UTC) - timedelta(minutes=5)
            messages_collection = AgentSessionMessage.get_pymongo_collection()

            # Find messages with at least one mcp__okx__* tool_call entry that
            # lacks `result_summary` AND was created before the cutoff. Mongo's
            # array filter does this in one update.
            result = await messages_collection.update_many(
                {
                    "created_at": {"$lt": cutoff},
                    "tool_calls": {
                        "$elemMatch": {
                            "name": {"$regex": "^mcp__okx__"},
                            "result_summary": {"$exists": False},
                        }
                    },
                },
                {
                    "$set": {
                        "tool_calls.$[orphan].result_summary": {
                            "error": "orphaned at startup (backend restarted mid-call)"
                        }
                    },
                    "$currentDate": {"updated_at": True},
                },
                array_filters=[
                    {
                        "orphan.name": {"$regex": "^mcp__okx__"},
                        "orphan.result_summary": {"$exists": False},
                    }
                ],
            )
            if result.modified_count:
                logger.info(
                    "startup_reconciler: flipped %d orphan ATK tool bubble(s) to failed",
                    result.modified_count,
                )
        except Exception:
            logger.exception("startup_reconciler: ATK orphan sweep failed")

    async def _mark_orphaned_discovery_cycles_failed(self) -> None:
        """Flip stale `running` cycles + active subagent sessions to closed state."""
        try:
            from app.db.models.agent_session import AgentSession, SessionKind
            from app.db.models.strategy_discovery_cycle import (
                DiscoveryCycleStatus,
                StrategyDiscoveryCycle,
            )

            now = datetime.now(UTC)

            cycles_collection = StrategyDiscoveryCycle.get_pymongo_collection()
            cycle_result = await cycles_collection.update_many(
                {"status": DiscoveryCycleStatus.RUNNING.value},
                {
                    "$set": {
                        "status": DiscoveryCycleStatus.FAILED.value,
                        "error": "Process restarted while cycle was running",
                        "ended_at": now,
                    }
                },
            )

            sessions_collection = AgentSession.get_pymongo_collection()
            messages_collection = sessions_collection.database["agent_session_messages"]

            # Per-Extractor AgentSessions are no longer created (extractors
            # are pure compute and feed back into the Explorer's session).
            # Delete any historical "Strategy Extract — *" sessions left
            # over from the older design so the sidebar doesn't show them.
            extract_docs = await sessions_collection.find(
                {"title": {"$regex": "^Strategy Extract"}},
                {"_id": 1},
            ).to_list(length=None)
            extract_ids = [doc["_id"] for doc in extract_docs]
            extract_msgs_deleted = 0
            extract_sessions_deleted = 0
            if extract_ids:
                msg_result = await messages_collection.delete_many(
                    {"session_id": {"$in": extract_ids}}
                )
                extract_msgs_deleted = msg_result.deleted_count
                sess_result = await sessions_collection.delete_many({"_id": {"$in": extract_ids}})
                extract_sessions_deleted = sess_result.deleted_count

            # Active Explorer sessions whose process is gone — flip closed.
            session_result = await sessions_collection.update_many(
                {
                    "is_active": True,
                    "title": {"$regex": "^Strategy Explorer"},
                },
                {"$set": {"is_active": False, "ended_at": now}},
            )

            # Task-run sessions left is_active=true from a prior dead process.
            # Every watchfiles reload during dev creates one of these — without
            # closing them, the chat sidebar keeps accruing "live" task rows
            # that will never emit another message.
            task_run_result = await sessions_collection.update_many(
                {
                    "is_active": True,
                    "session_kind": SessionKind.TASK_RUN.value,
                },
                {"$set": {"is_active": False, "ended_at": now}},
            )

            if (
                cycle_result.modified_count
                or session_result.modified_count
                or task_run_result.modified_count
                or extract_sessions_deleted
            ):
                logger.info(
                    "Startup cleanup: %d orphan cycle(s), %d orphan explorer session(s), "
                    "%d orphan task_run session(s), "
                    "deleted %d legacy extractor session(s) (%d messages)",
                    cycle_result.modified_count,
                    session_result.modified_count,
                    task_run_result.modified_count,
                    extract_sessions_deleted,
                    extract_msgs_deleted,
                )
        except Exception:
            logger.debug("Orphaned-cycle cleanup failed", exc_info=True)

    async def _backfill_strategy_shadows(self) -> None:
        """Create `Strategy` shadow docs for any `StrategyKnowledge` missing one."""
        try:
            from app.db.models.knowledge import StrategyKnowledge
            from app.db.models.strategy import Strategy
            from app.db.models.user import User

            superuser = await User.find_one(User.is_superuser == True)  # noqa: E712
            if superuser is None:
                return

            existing_names = {
                s.name
                async for s in Strategy.find_all().project(Strategy)  # type: ignore[attr-defined]
            }
            # Fallback — Beanie's project may not be usable here; fetch names directly.
            if not existing_names:
                coll = Strategy.get_pymongo_collection()
                existing_names = {
                    doc["name"] async for doc in coll.find({}, {"name": 1}) if "name" in doc
                }

            created = 0
            async for knowledge in StrategyKnowledge.find_all():
                if knowledge.name in existing_names:
                    continue
                if not knowledge.entry_rules:
                    # Same validation legacy code used — skip malformed entries.
                    continue
                try:
                    strategy_doc = Strategy(
                        user_id=superuser.id,
                        name=knowledge.name,
                        description=knowledge.description,
                        entry_rules=knowledge.entry_rules,
                        exit_rules=knowledge.exit_rules,
                        risk_params=knowledge.risk_params,
                        symbols=[],
                        timeframes=knowledge.timeframes or [],
                        is_active=False,
                        auto_discovered=True,
                        source_url=knowledge.source_url,
                        knowledge_id=knowledge.id,
                    )
                    await strategy_doc.insert()
                    existing_names.add(knowledge.name)
                    created += 1
                except Exception:
                    logger.debug("Backfill failed for strategy %s", knowledge.name, exc_info=True)
            if created:
                logger.info(
                    "Backfilled %d Strategy shadow doc(s) from orphaned StrategyKnowledge",
                    created,
                )
        except Exception:
            logger.debug("Strategy shadow backfill failed", exc_info=True)
