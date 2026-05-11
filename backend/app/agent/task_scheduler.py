"""Agent task scheduler for scheduled trading operations."""

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from beanie import PydanticObjectId

from app.agent.constants import agent_channel_user_id
from app.agent.memory_telemetry import log_memory_checkpoint
from app.agent.scheduling import PeriodicJob, PeriodicJobManager, StartupReconciler
from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    DecisionType,
    ExecutionStatus,
)
from app.db.models.agent_session import (
    AgentSession,
    SessionKind,
    delete_session_message_history,
    persist_session_message,
    persist_session_message_doc,
)
from app.db.models.agent_task import (
    AgentMode,
    AgentTask,
    HoldingTerm,
    MonitoringConditionType,
    RiskLevel,
    TaskFrequency,
    TaskModificationMode,
    TaskSchedule,
    TaskStatus,
)
from app.db.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)

_SESSION_CLEANUP_INTERVAL_HOURS = 6
_TASK_INSTRUCTION_GENERIC_HEADINGS = {"portfolio context"}

_T = TypeVar("_T")

AUTO_DISCOVER_JOB_ID = "auto_discover_strategies"
PATTERN_MINING_JOB_ID = "mine_trading_patterns"

EMERGENCY_STOP_MESSAGE = "Emergency stop is active — lift it before running this action"


async def is_emergency_stopped() -> bool:
    """True when the global emergency-stop latch is set. Fails closed on DB error."""
    try:
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
    except Exception:
        logger.warning("Emergency-stop check failed; fail-closed to True", exc_info=True)
        return True
    return bool(app_settings.emergency_stop_active)


async def _discovery_enabled(settings) -> bool:
    """Async predicate for the auto-discovery periodic job.

    Returns False when the toggle is off or the emergency-stop latch is set.
    Discovery is intentionally NOT gated on active-task count — users can run
    discovery independently of whether any trading task happens to be ACTIVE.
    """
    if not settings.auto_discover_enabled:
        return False
    if settings.emergency_stop_active:
        return False
    return True


async def _pattern_mining_enabled(settings) -> bool:
    """Async predicate for the pattern-mining periodic job.

    Honors the emergency-stop latch so one kill-switch halts every recurring
    agent-adjacent job, not just trading tasks and discovery.
    """
    if not settings.pattern_mining_enabled:
        return False
    if settings.emergency_stop_active:
        return False
    return True


async def _session_cleanup_enabled(settings) -> bool:
    """Async predicate for the stale-session cleanup job."""
    return settings.session_retention_days > 0


async def _persist_and_broadcast_assistant(
    *,
    session: AgentSession,
    task: AgentTask,
    content: str,
) -> None:
    """Persist a final assistant message AND broadcast a live `message` event.

    Matches legs Persistence + Live stream of `.claude/rules/code-guide.md`
    "Chat-Session Features". Without the broadcast the chat viewer only
    picks up the message on page reload.
    """
    now = datetime.now(UTC)
    persisted_doc = await persist_session_message_doc(
        session, role="assistant", content=content, timestamp=now
    )
    try:
        from app.api.websocket.connection_manager import manager

        await manager.broadcast_to_channel(
            f"agent:chat:{agent_channel_user_id(task.user_id)}",
            {
                "type": "message",
                "session_id": str(session.id),
                "data": {
                    "id": str(persisted_doc.id),
                    "role": "assistant",
                    "content": content,
                    "timestamp": int(now.timestamp() * 1000),
                },
            },
        )
    except Exception:
        logger.debug("Task final-message broadcast failed", exc_info=True)


class AgentTaskScheduler:
    """Schedules and manages agent trading tasks."""

    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()
        self._running = False
        self._running_tasks: dict[str, dict] = {}  # task_id -> progress dict (JSON-safe)
        self._task_runners: dict[str, asyncio.Task] = {}  # task_id -> asyncio.Task handle
        self._periodic_jobs = PeriodicJobManager(self.scheduler)

    def _set_modification_context(self, request_id: str, task: AgentTask) -> None:
        """Set task execution context for the modify_task tool."""
        if task.task_modification_mode != TaskModificationMode.DISABLED:
            from app.agent.mcp_tools import set_task_execution_context

            set_task_execution_context(
                request_id=request_id,
                task_id=str(task.id),
                user_id=str(task.user_id),
                mode=task.task_modification_mode.value,
            )

    def _clear_modification_context(self, request_id: str) -> None:
        """Clear task execution context after agent completes."""
        from app.agent.mcp_tools import clear_task_execution_context

        clear_task_execution_context(request_id)

    # Transient error types that justify a retry
    _RETRYABLE_ERRORS = (ConnectionError, TimeoutError, OSError)

    # Patterns that indicate an expired/invalid auth token from the Claude CLI subprocess
    _AUTH_ERROR_PATTERNS = (
        "authentication_error",
        "Failed to authenticate",
        "Invalid authentication credentials",
    )

    @staticmethod
    def _is_auth_error(exc: Exception) -> bool:
        """Check whether an exception indicates an expired/invalid auth token."""
        msg = str(exc)
        return any(p in msg for p in AgentTaskScheduler._AUTH_ERROR_PATTERNS)

    async def _run_with_fresh_agent(
        self,
        runner: Callable[[Any], Awaitable[_T]],
        *,
        max_retries: int = 0,
        session_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
        session_kind: SessionKind = SessionKind.TASK_RUN,
    ) -> _T:
        """Run one operation inside a fresh TradingAgent instance with retries."""
        from app.agent.trading_agent import create_agent_with_tools

        for attempt in range(max_retries + 1):
            agent = None
            create_baseline_mb = log_memory_checkpoint(
                logger,
                phase="task_agent_create_start",
                session_id=session_id,
                task_id=task_id,
                symbol=symbol,
                session_kind=session_kind.value,
                extra={"attempt": attempt + 1},
            )
            agent_created_mb: float | None = None

            try:
                agent = await create_agent_with_tools(session_id=str(uuid.uuid4()))
                agent_created_mb = log_memory_checkpoint(
                    logger,
                    phase="task_agent_create_done",
                    session_id=session_id,
                    task_id=task_id,
                    symbol=symbol,
                    session_kind=session_kind.value,
                    baseline_mb=create_baseline_mb,
                    extra={"attempt": attempt + 1},
                )
                result = await runner(agent)
                log_memory_checkpoint(
                    logger,
                    phase="task_agent_turn_done",
                    session_id=session_id,
                    task_id=task_id,
                    symbol=symbol,
                    session_kind=session_kind.value,
                    baseline_mb=agent_created_mb,
                    extra={"attempt": attempt + 1},
                )
                return result
            except self._RETRYABLE_ERRORS as e:
                if attempt == max_retries:
                    raise
                wait = 2**attempt * 5
                logger.warning(
                    "Retry %d/%d after transient error: %s (waiting %ds)",
                    attempt + 1,
                    max_retries,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)
            except Exception as e:
                if not self._is_auth_error(e) or attempt == max_retries:
                    raise
                wait = 2**attempt * 5
                logger.warning(
                    "Retry %d/%d after auth error: %s (waiting %ds)",
                    attempt + 1,
                    max_retries,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)
            finally:
                if agent is not None:
                    disconnect_baseline_mb = log_memory_checkpoint(
                        logger,
                        phase="task_agent_disconnect_start",
                        session_id=session_id,
                        task_id=task_id,
                        symbol=symbol,
                        session_kind=session_kind.value,
                        baseline_mb=agent_created_mb,
                        extra={"attempt": attempt + 1},
                    )
                    try:
                        await agent.disconnect()
                    except Exception:
                        logger.debug("Error disconnecting task trading agent", exc_info=True)
                    finally:
                        log_memory_checkpoint(
                            logger,
                            phase="task_agent_disconnect_done",
                            session_id=session_id,
                            task_id=task_id,
                            symbol=symbol,
                            session_kind=session_kind.value,
                            baseline_mb=disconnect_baseline_mb,
                            extra={"attempt": attempt + 1},
                        )

    async def start(self) -> None:
        """Start the scheduler and load active tasks."""
        if self._running:
            return

        self._running = True
        self.scheduler.start()
        logger.info("Agent task scheduler started")

        # Add cleanup job for expired notifications
        self.scheduler.add_job(
            self._cleanup_expired_notifications,
            IntervalTrigger(minutes=5),
            id="cleanup_notifications",
            name="Cleanup expired notifications",
            replace_existing=True,
        )

        # Load tasks and schedule periodic jobs in parallel
        await asyncio.gather(
            self._load_active_tasks(),
            self._register_periodic_jobs(),
            StartupReconciler().reconcile(),
        )

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        self.scheduler.shutdown(wait=False)

        logger.info("Agent task scheduler stopped")

    def _build_periodic_jobs(self) -> list[PeriodicJob]:
        """Return the set of interval-triggered background jobs.

        Each descriptor captures what changes between jobs. Shared
        concerns (sentry wrapping, try/except, last-run persistence,
        catch-up on startup) live in `PeriodicJobManager`.
        """
        return [
            PeriodicJob(
                job_id=AUTO_DISCOVER_JOB_ID,
                name="Strategy auto-discovery",
                log_label="Strategy auto-discovery",
                last_run_field="auto_discover_last_run_at",
                # Gated on (1) toggle, (2) emergency-stop latch, and
                # (3) at least one ACTIVE trading task. Discovery is
                # downstream of live trading — if nothing is trading,
                # don't burn tokens extracting strategies.
                enabled=_discovery_enabled,
                interval=lambda s: timedelta(hours=max(1, s.auto_discover_interval_hours)),
                runner=self._run_strategy_discovery,
                sentry_op="task",
            ),
            PeriodicJob(
                job_id=PATTERN_MINING_JOB_ID,
                name="Trading pattern mining",
                log_label="Pattern mining",
                last_run_field="pattern_mining_last_run_at",
                enabled=_pattern_mining_enabled,
                interval=lambda s: timedelta(hours=max(1, s.pattern_mining_interval_hours)),
                runner=self._run_pattern_mining,
                sentry_op="task",
            ),
            PeriodicJob(
                job_id="cleanup_old_sessions",
                name="Cleanup old chat sessions",
                log_label="Session cleanup",
                last_run_field="session_cleanup_last_run_at",
                enabled=_session_cleanup_enabled,
                interval=lambda _s: timedelta(hours=_SESSION_CLEANUP_INTERVAL_HOURS),
                runner=self._cleanup_old_sessions,
                sentry_op="task",
            ),
        ]

    async def _register_periodic_jobs(self) -> None:
        """Register every periodic background job with the manager."""
        for job in self._build_periodic_jobs():
            await self._periodic_jobs.register(job)

    async def _reschedule_job(self, job_id: str) -> None:
        """Re-register a single periodic job after a settings change."""
        if not self._running:
            return
        for job in self._build_periodic_jobs():
            if job.job_id == job_id:
                await self._periodic_jobs.register(job)
                return

    @property
    def discovery_next_run_at(self) -> datetime | None:
        """Next scheduled fire time for auto-discovery, or None if not scheduled."""
        return self._periodic_jobs.next_run_at(AUTO_DISCOVER_JOB_ID)

    @property
    def pattern_mining_next_run_at(self) -> datetime | None:
        """Next scheduled fire time for pattern mining, or None if not scheduled."""
        return self._periodic_jobs.next_run_at(PATTERN_MINING_JOB_ID)

    async def reschedule_auto_discovery(self) -> None:
        """Public method to reschedule after settings change."""
        await self._reschedule_job(AUTO_DISCOVER_JOB_ID)

    async def reschedule_pattern_mining(self) -> None:
        """Public method to reschedule after settings change."""
        await self._reschedule_job(PATTERN_MINING_JOB_ID)

    async def reschedule_session_cleanup(self) -> None:
        """Public method to reschedule after settings change."""
        await self._reschedule_job("cleanup_old_sessions")

    async def _run_strategy_discovery(self) -> None:
        """Run one strategy discovery cycle. Wrapping is the manager's job."""
        from app.db.models.user import User
        from app.services.strategy_discovery import StrategyDiscoveryService

        # Resolve a user_id so `_save_strategy` creates the Strategy shadow
        # doc in addition to StrategyKnowledge. Without this, auto-discovered
        # strategies are invisible on the Strategies page.
        owner_user_id = None
        try:
            superuser = await User.find_one(User.is_superuser == True)  # noqa: E712
            if superuser is not None:
                owner_user_id = superuser.id
        except Exception:
            logger.debug("Could not resolve superuser for scheduler run", exc_info=True)

        service = StrategyDiscoveryService()
        stats = await service.run_discovery_cycle(user_id=owner_user_id)
        logger.info("Strategy discovery stats: %s", stats)

    async def _run_pattern_mining(self) -> None:
        """Run one pattern mining cycle. Wrapping is the manager's job."""
        from app.db.models.app_settings import AppSettings
        from app.services.pattern_miner import PatternMiner

        app_settings = await AppSettings.get_instance()
        symbols = app_settings.pattern_mining_symbols or None

        miner = PatternMiner()
        stats = await miner.run_mining_cycle(symbols)
        logger.info("Pattern mining stats: %s", stats)

    async def _cleanup_old_sessions(self) -> None:
        """Delete chat sessions older than the configured retention period."""
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
        days = app_settings.session_retention_days
        if days <= 0:
            # Settings may have flipped between scheduling and firing — bail cleanly.
            return

        cutoff = datetime.now(UTC) - timedelta(days=days)

        old_sessions = await AgentSession.find(
            {
                "$or": [
                    {"last_message_at": {"$lt": cutoff}},
                    {"last_message_at": None, "started_at": {"$lt": cutoff}},
                ]
            }
        ).to_list()

        if old_sessions:
            for session in old_sessions:
                await delete_session_message_history(session.id)
                await session.delete()
            logger.info("Cleaned up %d old sessions (retention=%d days)", len(old_sessions), days)

    async def _load_active_tasks(self) -> None:
        """Load all active tasks from database and schedule them.

        Detects tasks that missed runs during downtime and triggers one
        catch-up execution for each before resuming the normal schedule.
        """
        tasks = await AgentTask.find(AgentTask.status == TaskStatus.ACTIVE).to_list()
        logger.info(f"Loading {len(tasks)} active tasks")

        overdue_task_ids: list[str] = []
        for task in tasks:
            try:
                if self._is_overdue(task):
                    overdue_task_ids.append(str(task.id))
                await self.schedule_task(task)
            except Exception as e:
                logger.error(f"Error scheduling task {task.id}: {e}")

        # Catch up overdue tasks (one execution each)
        if overdue_task_ids:
            logger.info(
                "Catching up %d overdue task(s) missed during downtime",
                len(overdue_task_ids),
            )
            for task_id in overdue_task_ids:
                asyncio.create_task(self._execute_task(task_id))

    def _is_overdue(self, task: AgentTask) -> bool:
        """Check if a task missed its scheduled run(s) during app downtime."""
        if not task.schedules:
            return False

        ref_time = task.last_run_at or task.created_at
        if not ref_time:
            return False

        now = datetime.now(UTC)
        for schedule in task.schedules:
            if not schedule.enabled or schedule.frequency == TaskFrequency.ONCE:
                continue
            interval = self._get_schedule_interval(schedule)
            if interval and (now - ref_time) > interval:
                return True
        return False

    @staticmethod
    def _get_schedule_interval(schedule: TaskSchedule) -> timedelta | None:
        """Return the effective interval for a schedule entry."""
        from app.db.models.agent_task import IntervalUnit

        if schedule.interval_value and schedule.interval_unit:
            if schedule.interval_unit == IntervalUnit.MINUTES:
                return timedelta(minutes=schedule.interval_value)
            return timedelta(hours=schedule.interval_value)
        if schedule.frequency == TaskFrequency.DAILY:
            return timedelta(days=1)
        if schedule.frequency == TaskFrequency.WEEKLY:
            return timedelta(weeks=1)
        return None

    async def schedule_task(self, task: AgentTask) -> None:
        """Schedule a task for execution (one job per schedule entry)."""
        # Remove all existing jobs for this task
        self._remove_task_jobs(str(task.id))

        if not task.schedules:
            logger.warning(f"Task {task.id} has no schedules")
            return

        earliest_next_run: datetime | None = None
        now = datetime.now(UTC)

        for idx, schedule in enumerate(task.schedules):
            if not schedule.enabled:
                continue
            job_id = f"task_{task.id}_sched_{idx}"
            trigger = self._create_trigger_from_schedule(schedule, task.timezone)
            if trigger is None:
                logger.warning(f"Could not create trigger for task {task.id} schedule {idx}")
                continue

            self.scheduler.add_job(
                self._execute_task,
                trigger,
                args=[str(task.id)],
                id=job_id,
                name=f"{task.name} [sched {idx}]",
                replace_existing=True,
            )

            # Track earliest next fire time
            if schedule.frequency != TaskFrequency.ONCE:
                next_fire = trigger.get_next_fire_time(now, now)
                if next_fire and (earliest_next_run is None or next_fire < earliest_next_run):
                    earliest_next_run = next_fire

        if earliest_next_run:
            task.next_run_at = earliest_next_run.astimezone(UTC)
            await task.save()

        logger.info(
            f"Scheduled task {task.name} ({task.id}) with {len(task.schedules)} schedule(s)"
        )

    def _remove_task_jobs(self, task_id: str) -> None:
        """Remove all scheduler jobs for a task."""
        prefix = f"task_{task_id}"
        for job in self.scheduler.get_jobs():
            if job.id == prefix or job.id.startswith(f"{prefix}_sched_"):
                self.scheduler.remove_job(job.id)

    def _create_trigger_from_schedule(self, schedule: TaskSchedule, timezone: str):
        """Create APScheduler trigger from a TaskSchedule."""
        if schedule.frequency == TaskFrequency.ONCE:
            run_at = datetime.now(UTC) + timedelta(seconds=5)
            return DateTrigger(run_date=run_at)

        elif schedule.frequency == TaskFrequency.INTERVAL:
            return self._make_interval_trigger(schedule, timezone=timezone)

        elif schedule.frequency == TaskFrequency.DAILY:
            if schedule.interval_value and schedule.interval_unit:
                # Daily with repeat → interval trigger anchored at scheduled_time
                return self._make_interval_trigger(schedule, timezone=timezone)

            if schedule.scheduled_time:
                hour, minute = map(int, schedule.scheduled_time.split(":"))
            else:
                hour, minute = 9, 0

            return CronTrigger(hour=hour, minute=minute, timezone=timezone)

        elif schedule.frequency == TaskFrequency.WEEKLY:
            if schedule.interval_value and schedule.interval_unit:
                # Weekly with repeat → interval trigger anchored at scheduled day+time
                return self._make_interval_trigger(schedule, timezone=timezone)

            if schedule.scheduled_time:
                hour, minute = map(int, schedule.scheduled_time.split(":"))
            else:
                hour, minute = 9, 0

            day_of_week = schedule.day_of_week if schedule.day_of_week is not None else 0
            return CronTrigger(
                day_of_week=day_of_week,
                hour=hour,
                minute=minute,
                timezone=timezone,
            )

        elif schedule.frequency == TaskFrequency.CUSTOM:
            if schedule.cron_expression:
                return CronTrigger.from_crontab(schedule.cron_expression, timezone=timezone)
            else:
                logger.error("Custom frequency schedule missing cron_expression")
                return None

        return None

    @staticmethod
    def _make_interval_trigger(
        schedule: TaskSchedule,
        timezone: str | None = None,
    ) -> IntervalTrigger:
        """Build an IntervalTrigger, optionally anchored to scheduled_time."""
        from app.db.models.agent_task import IntervalUnit

        kwargs: dict[str, Any] = {}
        if schedule.interval_unit == IntervalUnit.MINUTES:
            kwargs["minutes"] = schedule.interval_value
        else:
            kwargs["hours"] = schedule.interval_value

        # Anchor to scheduled_time so intervals align (e.g. "every 2h starting 08:00")
        if schedule.scheduled_time and timezone:
            from zoneinfo import ZoneInfo

            hour, minute = map(int, schedule.scheduled_time.split(":"))
            tz = ZoneInfo(timezone)
            today = datetime.now(tz).replace(hour=hour, minute=minute, second=0, microsecond=0)
            kwargs["start_date"] = today
            kwargs["timezone"] = tz
        elif timezone:
            from zoneinfo import ZoneInfo

            kwargs["timezone"] = ZoneInfo(timezone)

        return IntervalTrigger(**kwargs)

    async def _should_abort_run(self, task_id: str) -> bool:
        """Return True if the task is no longer ACTIVE (e.g. paused via emergency stop)."""
        fresh = await AgentTask.get(PydanticObjectId(task_id))
        if fresh is None or fresh.status != TaskStatus.ACTIVE:
            if task_id in self._running_tasks:
                self._running_tasks[task_id]["aborted"] = True
            return True
        return False

    async def _emit_run_end_if_aborted(self, task_id: str, on_event: Callable) -> None:
        """Emit cancel_ack so the frontend clears the thinking/streaming UI state."""
        aborted = self._running_tasks.get(task_id, {}).get("aborted", False)
        if not aborted:
            return
        try:
            await on_event({"type": "cancel_ack", "data": {"reason": "emergency_stop"}})
        except Exception:
            logger.debug("Failed to emit cancel_ack for task %s", task_id, exc_info=True)

    async def _execute_task(self, task_id: str) -> None:
        """Execute a scheduled task."""
        if task_id in self._running_tasks:
            logger.warning("Task %s is already running, skipping duplicate execution", task_id)
            return

        # Defense in depth: refuse any execution path while the latch is set.
        if await is_emergency_stopped():
            logger.info("Task %s skipped: emergency stop active", task_id)
            return

        logger.info(f"Executing task {task_id}")
        self._running_tasks[task_id] = {
            "current_symbol": None,
            "completed": 0,
            "total": 0,
            "session_ids": [],
        }
        current = asyncio.current_task()
        if current is not None:
            self._task_runners[task_id] = current

        try:
            with sentry_sdk.start_transaction(op="task", name="agent-task-execution") as txn:
                txn.set_tag("task_id", task_id)
                try:
                    task = await AgentTask.get(PydanticObjectId(task_id))
                    if not task:
                        logger.warning("Task %s not found — removing orphaned job", task_id)
                        self._remove_task_jobs(task_id)
                        return

                    if task.status != TaskStatus.ACTIVE:
                        logger.info(f"Task {task_id} is not active, skipping")
                        return

                    # Set user context so memory tools work in scheduled tasks
                    from app.agent.mcp_tools import set_active_user_id

                    set_active_user_id(str(task.user_id))

                    self._running_tasks[task_id]["total"] = len(task.symbols)

                    txn.set_tag("task_name", task.name)
                    txn.set_tag("trading_enabled", str(task.trading_enabled))
                    txn.set_tag("monitoring_enabled", str(task.monitoring_enabled))

                    # Execute based on capability toggles (analysis is always the base)
                    if task.trading_enabled:
                        await self._execute_trading_task(task)
                    else:
                        await self._execute_analysis_task(task)

                    if task.monitoring_enabled and not await self._should_abort_run(task_id):
                        await self._execute_monitoring_task(task)

                    aborted = self._running_tasks.get(task_id, {}).get("aborted", False)

                    # Mark as completed if all schedules are one-time (skip if aborted)
                    all_once = all(s.frequency == TaskFrequency.ONCE for s in task.schedules)
                    if all_once and not aborted:
                        task.complete()
                        await task.save()
                        self._remove_task_jobs(str(task.id))

                    # Create completion notification (with desktop toast) — skip if aborted
                    if not aborted:
                        try:
                            from app.services.notification_service import NotificationService

                            svc = NotificationService()
                            await svc.create_notification(
                                user_id=task.user_id,
                                title=f"Task Completed: {task.name}",
                                body=f"Analyzed {len(task.symbols)} symbol(s) successfully.",
                                notification_type=NotificationType.TASK_COMPLETED,
                                task_id=task.id,
                            )
                        except Exception:
                            logger.debug("Failed to create completion notification", exc_info=True)

                except Exception as e:
                    logger.error(f"Error executing task {task_id}: {e}")
                    task = await AgentTask.get(PydanticObjectId(task_id))
                    if task:
                        task.record_execution(success=False, error=str(e))
                        await self._check_auto_pause(task)
                        await task.save()
        except asyncio.CancelledError:
            # Emergency stop cancelled this run — swallow so APScheduler doesn't
            # treat it as an error. Cleanup happens in the finally block below.
            logger.info("Task %s cancelled via emergency stop", task_id)
        finally:
            try:
                await self._update_next_run_at(task_id)
            except Exception:
                logger.debug("Failed to update next_run_at for task %s", task_id, exc_info=True)
            self._running_tasks.pop(task_id, None)
            self._task_runners.pop(task_id, None)

    async def _update_next_run_at(self, task_id: str) -> None:
        """Refresh task.next_run_at from APScheduler's actual next fire time."""
        task = await AgentTask.get(PydanticObjectId(task_id))
        if not task:
            return

        earliest: datetime | None = None
        prefix = f"task_{task_id}"
        for job in self.scheduler.get_jobs():
            if job.id == prefix or job.id.startswith(f"{prefix}_sched_"):
                nrt = job.next_run_time
                if nrt and (earliest is None or nrt < earliest):
                    earliest = nrt

        task.next_run_at = earliest.astimezone(UTC) if earliest else None
        await task.save()

    async def _execute_analysis_task(self, task: AgentTask) -> None:
        """Execute an analysis-only task.

        All symbols are analyzed inside a single ``AgentSession`` for the run,
        so the session viewer shows one chat per scheduled execution instead of
        one per coin.
        """
        task_id = str(task.id)

        if not task.symbols:
            return

        # Create ONE session for the whole run (covering all symbols)
        now = datetime.now(UTC)
        session = AgentSession(
            user_id=task.user_id,
            session_kind=SessionKind.TASK_RUN,
            title=task.name,
            symbols_discussed=list(task.symbols),
            is_active=True,
            started_at=now,
            last_message_at=now,
        )
        await session.insert()
        session_id_str = str(session.id)
        if task_id in self._running_tasks:
            self._running_tasks[task_id]["active_session_id"] = session_id_str
            self._running_tasks[task_id]["session_ids"].append(session_id_str)

        # One event emitter shared across all symbol turns in this run
        on_event = self._make_task_event_emitter(task.user_id, session_id_str)

        try:
            for symbol in task.symbols:
                if await self._should_abort_run(task_id):
                    logger.info("Task %s aborted mid-run; skipping remaining symbols", task_id)
                    break
                if task_id in self._running_tasks:
                    self._running_tasks[task_id]["current_symbol"] = symbol
                try:
                    # Build prompt — optionally enriched with subagent results
                    subagent_context = None
                    if task.use_subagents:
                        logger.info("Running subagent analysis for %s", symbol)
                        subagent_context = await self._run_subagent_analysis(symbol, task)
                        prompt = self._build_enriched_prompt(symbol, task, subagent_context)
                    else:
                        prompt = self._build_analysis_prompt(symbol, task)

                    # Inject user memory context
                    try:
                        from app.agent.tools.memory_tools import load_session_memories

                        mem_ctx = await load_session_memories(str(task.user_id))
                        if mem_ctx:
                            prompt = f"{mem_ctx}\n\n{prompt}"
                    except Exception:
                        logger.debug("Failed to inject memory context for task", exc_info=True)

                    # Persist this symbol's user prompt into the shared session
                    now = datetime.now(UTC)
                    await persist_session_message(
                        session,
                        role="user",
                        content=prompt,
                        timestamp=now,
                    )
                    await session.save()

                    # Set task context for modify_task tool
                    request_id = f"task-{task.id}-{symbol}"
                    self._set_modification_context(request_id, task)

                    # Run agent analysis with retry on transient errors
                    try:
                        result = await self._run_with_fresh_agent(
                            lambda current_agent: current_agent.analyze(
                                user_message=prompt,
                                user_id=str(task.user_id),
                                on_event=on_event,
                            ),
                            max_retries=task.max_retries,
                            session_id=session_id_str,
                            task_id=task_id,
                            symbol=symbol,
                        )
                    finally:
                        self._clear_modification_context(request_id)

                    await _persist_and_broadcast_assistant(
                        session=session,
                        task=task,
                        content=result.get("reasoning")
                        or result.get("summary", "Analysis completed"),
                    )

                    # Store decision
                    decision = AgentDecision(
                        user_id=task.user_id,
                        session_id=session.id,
                        task_id=task.id,
                        decision_type=DecisionType.ANALYSIS,
                        symbol=symbol,
                        summary=result.get("summary", "Analysis completed"),
                        reasoning=result.get("reasoning", ""),
                        key_factors=result.get("key_factors", []),
                        tools_used=result.get("tools_used", []),
                        market_context=result.get("market_context"),
                        confidence=result.get("confidence"),
                        action=self._parse_action(result.get("action")),
                    )
                    await decision.insert()

                    task.last_decision_id = decision.id
                    task.last_session_id = session.id
                    task.record_execution(success=True)
                    await task.save()

                    logger.info(f"Analysis completed for {symbol}")
                    if task_id in self._running_tasks:
                        self._running_tasks[task_id]["completed"] += 1

                except Exception as e:
                    logger.error(f"Error analyzing {symbol}: {e}")
                    task.record_execution(success=False, error=str(e))
                    await self._check_auto_pause(task)
                    await task.save()
                    if task_id in self._running_tasks:
                        self._running_tasks[task_id]["completed"] += 1
        finally:
            # Close the session exactly once, even if the loop bails out early
            now = datetime.now(UTC)
            session.is_active = False
            session.ended_at = now
            session.last_message_at = now
            await session.save()
            await self._emit_run_end_if_aborted(task_id, on_event)

    async def _execute_trading_task(self, task: AgentTask) -> None:
        """Execute a trading task (analysis + potential trade).

        All symbols in this run share a single ``AgentSession`` — one chat per
        scheduled execution, not one per coin.
        """
        risk_config = self._get_risk_config(task.risk_level)
        min_confidence = float(risk_config["min_confidence"])
        task_id = str(task.id)

        if not task.symbols:
            return

        # Create ONE session for the whole run (covering all symbols)
        now = datetime.now(UTC)
        session = AgentSession(
            user_id=task.user_id,
            session_kind=SessionKind.TASK_RUN,
            title=task.name,
            symbols_discussed=list(task.symbols),
            is_active=True,
            started_at=now,
            last_message_at=now,
        )
        await session.insert()
        session_id_str = str(session.id)
        if task_id in self._running_tasks:
            self._running_tasks[task_id]["active_session_id"] = session_id_str
            self._running_tasks[task_id]["session_ids"].append(session_id_str)

        # One event emitter shared across all symbol turns in this run
        on_event = self._make_task_event_emitter(task.user_id, session_id_str)

        try:
            for symbol in task.symbols:
                if await self._should_abort_run(task_id):
                    logger.info("Task %s aborted mid-run; skipping remaining symbols", task_id)
                    break
                if task_id in self._running_tasks:
                    self._running_tasks[task_id]["current_symbol"] = symbol
                try:
                    # Build prompt — optionally enriched with subagent results
                    subagent_context = None
                    if task.use_subagents:
                        logger.info("Running subagent analysis for %s", symbol)
                        subagent_context = await self._run_subagent_analysis(symbol, task)
                        prompt = self._build_enriched_prompt(symbol, task, subagent_context)
                    else:
                        prompt = self._build_trading_prompt(symbol, task)

                    # Inject relevant knowledge context from RAG
                    try:
                        from app.knowledge.retriever import get_retriever

                        knowledge_ctx = await get_retriever().get_relevant_context(
                            f"{symbol} trading",
                            max_results=6,
                        )
                        if knowledge_ctx and knowledge_ctx != "No relevant knowledge found.":
                            prompt = (
                                f"## Historical Knowledge Context\n{knowledge_ctx}\n\n"
                                f"---\n\n{prompt}"
                            )
                    except Exception:
                        logger.debug("Failed to inject knowledge context", exc_info=True)

                    # Inject user memory context
                    try:
                        from app.agent.tools.memory_tools import load_session_memories

                        mem_ctx = await load_session_memories(str(task.user_id))
                        if mem_ctx:
                            prompt = f"{mem_ctx}\n\n{prompt}"
                    except Exception:
                        logger.debug("Failed to inject memory context for task", exc_info=True)

                    # Persist this symbol's user prompt into the shared session
                    now = datetime.now(UTC)
                    await persist_session_message(
                        session,
                        role="user",
                        content=prompt,
                        timestamp=now,
                    )
                    await session.save()

                    # Set task context for modify_task tool
                    request_id = f"task-{task.id}-{symbol}"
                    self._set_modification_context(request_id, task)

                    # Run agent analysis with retry on transient errors
                    try:
                        result = await self._run_with_fresh_agent(
                            lambda current_agent: current_agent.analyze(
                                user_message=prompt,
                                user_id=str(task.user_id),
                                on_event=on_event,
                            ),
                            max_retries=task.max_retries,
                            session_id=session_id_str,
                            task_id=task_id,
                            symbol=symbol,
                        )
                    finally:
                        self._clear_modification_context(request_id)

                    action = self._parse_action(result.get("action"))
                    confidence = float(result.get("confidence") or 0)

                    await _persist_and_broadcast_assistant(
                        session=session,
                        task=task,
                        content=result.get("reasoning")
                        or result.get("summary", "Analysis completed"),
                    )

                    # Create decision record
                    decision = AgentDecision(
                        user_id=task.user_id,
                        session_id=session.id,
                        task_id=task.id,
                        decision_type=DecisionType.RECOMMENDATION,
                        symbol=symbol,
                        action=action,
                        confidence=confidence,
                        summary=result.get("summary", ""),
                        reasoning=result.get("reasoning", ""),
                        key_factors=result.get("key_factors", []),
                        suggested_entry=result.get("suggested_entry"),
                        suggested_stop_loss=result.get("suggested_stop_loss"),
                        suggested_take_profit=result.get("suggested_take_profit"),
                        suggested_position_size=result.get("suggested_position_size"),
                        risk_reward_ratio=result.get("risk_reward_ratio"),
                        tools_used=result.get("tools_used", []),
                        market_context=result.get("market_context"),
                        execution_status=ExecutionStatus.QUEUED,
                    )

                    # Determine if we should trade
                    should_trade = action in [DecisionAction.BUY, DecisionAction.SELL]

                    if should_trade and confidence < min_confidence:
                        should_trade = False
                        decision.execution_status = ExecutionStatus.FAILED
                        decision.execution_error_code = "confidence_below_threshold"
                        decision.execution_error_message = (
                            f"Confidence {confidence:.1f}% is below minimum {min_confidence:.1f}%"
                        )

                    if should_trade and task.max_daily_trades is not None:
                        trade_count_today = await self._get_today_trade_count(task.id)
                        if trade_count_today >= task.max_daily_trades:
                            should_trade = False
                            decision.execution_status = ExecutionStatus.FAILED
                            decision.execution_error_code = "max_daily_trades_reached"
                            decision.execution_error_message = (
                                f"Daily trade limit reached ({task.max_daily_trades})"
                            )

                    if should_trade:
                        if task.agent_mode == AgentMode.AUTO:
                            # Auto mode: execute immediately
                            decision.status = DecisionStatus.CONFIRMED
                            decision.execution_status = ExecutionStatus.SUBMITTED
                            await decision.insert()
                            await self.execute_trade_for_decision(
                                task=task,
                                decision=decision,
                                execution_source="task_auto",
                            )
                        else:
                            # Ask mode: create notification and wait for confirmation
                            decision.status = DecisionStatus.PENDING
                            decision.expires_at = datetime.now(UTC) + timedelta(hours=1)
                            await decision.insert()
                            await self._create_trade_confirmation_notification(task, decision)
                    else:
                        decision.status = DecisionStatus.EXECUTED
                        await decision.insert()

                    task.last_decision_id = decision.id
                    task.last_session_id = session.id
                    task.record_execution(success=True)
                    await task.save()
                    if task_id in self._running_tasks:
                        self._running_tasks[task_id]["completed"] += 1

                except Exception as e:
                    logger.error(f"Error in trading task for {symbol}: {e}")
                    task.record_execution(success=False, error=str(e))
                    await self._check_auto_pause(task)
                    await task.save()
                    if task_id in self._running_tasks:
                        self._running_tasks[task_id]["completed"] += 1
        finally:
            # Close the session exactly once, even if the loop bails out early
            now = datetime.now(UTC)
            session.is_active = False
            session.ended_at = now
            session.last_message_at = now
            await session.save()
            await self._emit_run_end_if_aborted(task_id, on_event)

    async def _get_today_trade_count(self, task_id: PydanticObjectId) -> int:
        """Count today's executed trades for a task."""
        now = datetime.now(UTC)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return await AgentDecision.find(
            AgentDecision.task_id == task_id,
            AgentDecision.decision_type == DecisionType.TRADE_EXECUTION,
            AgentDecision.executed_at >= day_start,
        ).count()

    async def _execute_monitoring_task(self, task: AgentTask) -> None:
        """Execute a monitoring task — evaluate conditions and fire alerts."""
        if not task.monitoring_conditions:
            logger.warning("Monitoring task %s has no conditions defined", task.id)
            task.record_execution(success=True)
            await task.save()
            return

        # Check cooldown
        if task.last_alert_at:
            cooldown_until = task.last_alert_at + timedelta(minutes=task.alert_cooldown_minutes)
            if datetime.now(UTC) < cooldown_until:
                logger.info("Monitoring task %s in cooldown, skipping", task.id)
                task.record_execution(success=True)
                await task.save()
                return

        from app.agent.tools.market_tools import get_ticker
        from app.agent.tools.technical_tools import get_technical_indicators

        task_id = str(task.id)
        for symbol in task.symbols:
            if await self._should_abort_run(task_id):
                logger.info("Task %s aborted mid-run; skipping remaining symbols", task_id)
                break
            try:
                # Fetch market data
                ticker = await get_ticker(symbol)
                current_price = float(ticker.get("last", 0))
                price_change_pct = float(ticker.get("change_24h_pct", 0))
                volume_24h = float(ticker.get("vol_24h", 0))
                avg_volume = float(ticker.get("avg_vol_24h", 0)) or volume_24h

                # Fetch technical indicators for RSI conditions
                indicators_data: dict = {}
                rsi_conditions = [
                    c
                    for c in task.monitoring_conditions
                    if c.condition_type
                    in (
                        MonitoringConditionType.RSI_ABOVE,
                        MonitoringConditionType.RSI_BELOW,
                    )
                ]
                if rsi_conditions:
                    tf = rsi_conditions[0].timeframe or "1H"
                    indicators_data = await get_technical_indicators(symbol, tf)

                rsi_value = indicators_data.get("indicators", {}).get("rsi_14")

                triggered: list[dict] = []

                for condition in task.monitoring_conditions:
                    ct = condition.condition_type
                    threshold = condition.threshold

                    if ct == MonitoringConditionType.PRICE_ABOVE:
                        if current_price > threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": current_price,
                                }
                            )
                    elif ct == MonitoringConditionType.PRICE_BELOW:
                        if current_price < threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": current_price,
                                }
                            )
                    elif ct == MonitoringConditionType.PRICE_CHANGE_PCT:
                        if abs(price_change_pct) >= threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": price_change_pct,
                                }
                            )
                    elif ct == MonitoringConditionType.RSI_ABOVE:
                        if rsi_value is not None and rsi_value > threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": rsi_value,
                                }
                            )
                    elif ct == MonitoringConditionType.RSI_BELOW:
                        if rsi_value is not None and rsi_value < threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": rsi_value,
                                }
                            )
                    elif ct == MonitoringConditionType.VOLUME_SPIKE:
                        if avg_volume > 0 and volume_24h >= avg_volume * threshold:
                            triggered.append(
                                {
                                    "condition": ct.value,
                                    "threshold": threshold,
                                    "current": (volume_24h / avg_volume if avg_volume else 0),
                                }
                            )
                    elif ct == MonitoringConditionType.CUSTOM:
                        # Delegate to AI for custom condition evaluation
                        prompt = (
                            f"Evaluate this condition for {symbol}: "
                            f"{condition.description or 'No description'}. "
                            f"Current price: {current_price}. "
                            "Reply with TRIGGERED or NOT_TRIGGERED and a brief reason."
                        )
                        try:
                            ai_response = await self._run_with_fresh_agent(
                                lambda current_agent: current_agent.chat(prompt),
                                task_id=str(task.id),
                                symbol=symbol,
                            )
                            if "triggered" in ai_response.lower().split("not_triggered")[0]:
                                triggered.append(
                                    {
                                        "condition": ct.value,
                                        "description": condition.description,
                                        "ai_response": ai_response[:300],
                                    }
                                )
                        except Exception as ai_err:
                            logger.warning("Custom condition AI evaluation failed: %s", ai_err)

                if triggered:
                    # Create monitoring alert decision
                    triggered_summary = ", ".join(t.get("condition", "unknown") for t in triggered)
                    decision = AgentDecision(
                        user_id=task.user_id,
                        task_id=task.id,
                        decision_type=DecisionType.MONITORING_ALERT,
                        symbol=symbol,
                        summary=f"Alert: {triggered_summary} triggered for {symbol}",
                        reasoning=str(triggered),
                        key_factors=[t.get("condition", "") for t in triggered],
                    )
                    await decision.insert()

                    # Create notification
                    notification = Notification(
                        user_id=task.user_id,
                        title=f"Alert: {symbol}",
                        body=f"Conditions triggered: {triggered_summary}",
                        notification_type=NotificationType.PRICE_ALERT,
                        task_id=task.id,
                        decision_id=decision.id,
                        data={
                            "symbol": symbol,
                            "triggered_conditions": triggered,
                        },
                    )
                    await notification.insert()

                    task.last_alert_at = datetime.now(UTC)
                    task.last_decision_id = decision.id

                    logger.info("Monitoring alert for %s: %s", symbol, triggered_summary)

            except Exception as e:
                logger.error(f"Error monitoring {symbol}: {e}")
                task.record_execution(success=False, error=str(e))
                await self._check_auto_pause(task)
                await task.save()
                return

        task.record_execution(success=True)
        await task.save()

    async def _check_auto_pause(self, task: AgentTask) -> None:
        """Auto-pause task and notify if consecutive failure threshold is reached."""
        if not task.should_auto_pause:
            return

        logger.warning(
            "Task %s (%s) auto-paused after %d consecutive failures",
            task.name,
            task.id,
            task.consecutive_failures,
        )
        task.pause()
        await self.unschedule_task(str(task.id))
        # Re-evaluate discovery gate — if this was the last ACTIVE task,
        # discovery should stop alongside it.
        await self.reschedule_auto_discovery()

        # Create failure notification
        notification = Notification(
            user_id=task.user_id,
            title=f"Task Paused: {task.name}",
            body=(
                f"Automatically paused after {task.consecutive_failures} consecutive "
                f"failures. Last error: {task.last_error or 'Unknown'}"
            ),
            notification_type=NotificationType.TASK_FAILED,
            task_id=task.id,
            data={
                "task_name": task.name,
                "consecutive_failures": task.consecutive_failures,
                "last_error": task.last_error,
            },
        )
        await notification.insert()

    async def execute_trade_for_decision(
        self,
        task: AgentTask,
        decision: AgentDecision,
        execution_source: str = "task",
    ) -> None:
        """Execute a trade based on a confirmed decision."""
        risk_config = self._get_risk_config(task.risk_level)

        try:
            if not decision.symbol or not decision.action:
                decision.mark_execution_failed(
                    "Decision is missing symbol or action",
                    error_code="invalid_decision",
                )
                await decision.save()
                return

            idempotency_key = f"task-{task.id}-decision-{decision.id}"

            trade_result = await self._run_with_fresh_agent(
                lambda current_agent: current_agent.execute_trade(
                    user_id=str(task.user_id),
                    symbol=decision.symbol,
                    action=decision.action.value,
                    position_size=decision.suggested_position_size,
                    stop_loss=decision.suggested_stop_loss,
                    take_profit=decision.suggested_take_profit,
                    reasoning=decision.reasoning,
                    idempotency_key=idempotency_key,
                    max_position_size=task.max_position_size,
                    risk_pct=float(risk_config["max_risk_percent"]),
                ),
                task_id=str(task.id),
                symbol=decision.symbol,
            )

            if trade_result.get("success"):
                decision.mark_executed(
                    order_id=PydanticObjectId(trade_result["order_id"]),
                    price=trade_result.get("execution_price"),
                )
                decision.decision_type = DecisionType.TRADE_EXECUTION
                await decision.save()

                await self._create_trade_executed_notification(task, decision)
                logger.info(
                    "Trade executed for %s (source=%s)",
                    decision.symbol,
                    execution_source,
                )
            else:
                error_message = trade_result.get("error", "Trade execution failed")
                decision.mark_execution_failed(
                    error_message,
                    error_code="exchange_rejected",
                )
                await decision.save()
                logger.error("Trade execution failed: %s", error_message)

        except Exception as e:
            decision.mark_execution_failed(
                str(e),
                error_code="execution_exception",
            )
            await decision.save()
            logger.error(f"Error executing trade: {e}")

    async def _create_trade_confirmation_notification(
        self, task: AgentTask, decision: AgentDecision
    ) -> None:
        """Create notification for trade confirmation (ASK mode)."""
        notification = Notification(
            user_id=task.user_id,
            title=f"Trade Confirmation: {decision.action.value.upper()} {decision.symbol}",
            body=f"Confidence: {decision.confidence}%. {decision.summary}",
            notification_type=NotificationType.TRADE_CONFIRMATION,
            decision_id=decision.id,
            task_id=task.id,
            data={
                "symbol": decision.symbol,
                "action": decision.action.value,
                "confidence": decision.confidence,
                "suggested_entry": decision.suggested_entry,
                "suggested_stop_loss": decision.suggested_stop_loss,
                "suggested_take_profit": decision.suggested_take_profit,
                "suggested_position_size": decision.suggested_position_size,
            },
            expires_at=decision.expires_at,
        )
        await notification.insert()

        # TODO: Send Web Push notification
        # await self._send_web_push(task.user_id, notification)

        logger.info(f"Created trade confirmation notification for {decision.symbol}")

    async def _create_trade_executed_notification(
        self, task: AgentTask, decision: AgentDecision
    ) -> None:
        """Create notification for executed trade."""
        notification = Notification(
            user_id=task.user_id,
            title=f"Trade Executed: {decision.action.value.upper()} {decision.symbol}",
            body=f"Executed at {decision.execution_price}",
            notification_type=NotificationType.TRADE_EXECUTED,
            decision_id=decision.id,
            task_id=task.id,
            order_id=decision.order_id,
            data={
                "symbol": decision.symbol,
                "action": decision.action.value,
                "execution_price": decision.execution_price,
            },
        )
        await notification.insert()
        logger.info(f"Created trade executed notification for {decision.symbol}")

    async def _cleanup_expired_notifications(self) -> None:
        """Clean up expired pending notifications and decisions."""
        with sentry_sdk.start_transaction(op="task", name="notification-cleanup"):
            now = datetime.now(UTC)

            # Find expired decisions
            expired_decisions = await AgentDecision.find(
                AgentDecision.status == DecisionStatus.PENDING,
                AgentDecision.expires_at < now,
            ).to_list()

            for decision in expired_decisions:
                decision.expire()
                await decision.save()

            # Find and expire related notifications
            expired_notifications = await Notification.find(
                Notification.expires_at < now,
                Notification.status == "pending",
            ).to_list()

            for notification in expired_notifications:
                notification.mark_expired()
                await notification.save()

            if expired_decisions:
                logger.info(f"Expired {len(expired_decisions)} pending decisions")

    async def _run_subagent_analysis(self, symbol: str, task: AgentTask) -> dict:
        """Run all 3 subagents in parallel and aggregate results."""
        from app.agent.subagents.fundamental_analyst import FundamentalAnalyst
        from app.agent.subagents.news_analyst import NewsAnalyst
        from app.agent.subagents.technical_analyst import TechnicalAnalyst

        tech = TechnicalAnalyst()
        fund = FundamentalAnalyst()
        news = NewsAnalyst()

        try:
            await asyncio.gather(tech.connect(), fund.connect(), news.connect())

            # Extract base asset from trading pair (BTC-USDT -> BTC)
            base_asset = symbol.split("-")[0]

            # Run analyses in parallel
            results = await asyncio.gather(
                tech.analyze(symbol),
                fund.analyze(base_asset),
                news.analyze([base_asset]),
                return_exceptions=True,
            )

            return {
                "technical": (
                    results[0]
                    if not isinstance(results[0], Exception)
                    else {"error": str(results[0])}
                ),
                "fundamental": (
                    results[1]
                    if not isinstance(results[1], Exception)
                    else {"error": str(results[1])}
                ),
                "news": (
                    results[2]
                    if not isinstance(results[2], Exception)
                    else {"error": str(results[2])}
                ),
            }
        finally:
            await asyncio.gather(
                tech.disconnect(),
                fund.disconnect(),
                news.disconnect(),
                return_exceptions=True,
            )

    def _build_enriched_prompt(
        self,
        symbol: str,
        task: AgentTask,
        subagent_results: dict,
    ) -> str:
        """Build a prompt enriched with subagent analysis results."""
        risk_config = self._get_risk_config(task.risk_level)

        sections = [f"Analyze {symbol} for a potential trade.\n"]

        # Technical analysis section
        tech = subagent_results.get("technical", {})
        if "error" not in tech:
            signal = tech.get("signal", {})
            analysis = tech.get("analysis", "")
            indicators = tech.get("indicators", {})
            sections.append("== TECHNICAL ANALYSIS (from specialist) ==")
            sections.append(f"Signal: {signal.get('action', 'N/A')}")
            sections.append(
                f"Key Indicators: RSI={indicators.get('rsi_14', 'N/A')}, "
                f"Trend={indicators.get('trend', 'N/A')}"
            )
            sections.append(f"Analysis: {analysis[:500]}")
            sections.append("")
        else:
            sections.append(f"== TECHNICAL ANALYSIS == Error: {tech['error']}\n")

        # Fundamental analysis section
        fund = subagent_results.get("fundamental", {})
        if "error" not in fund:
            valuation = fund.get("valuation", {})
            analysis = fund.get("analysis", "")
            sections.append("== FUNDAMENTAL ANALYSIS (from specialist) ==")
            sections.append(f"Valuation: {valuation.get('assessment', 'N/A')}")
            sections.append(f"Analysis: {analysis[:500]}")
            sections.append("")
        else:
            sections.append(f"== FUNDAMENTAL ANALYSIS == Error: {fund['error']}\n")

        # News analysis section
        news_data = subagent_results.get("news", {})
        if "error" not in news_data:
            signal = news_data.get("signal", {})
            analysis = news_data.get("analysis", "")
            sections.append("== NEWS SENTIMENT (from specialist) ==")
            sections.append(f"Signal: {signal.get('action', 'N/A')}")
            sections.append(f"Sentiment: {signal.get('sentiment_basis', 'N/A')}")
            sections.append(f"Analysis: {analysis[:500]}")
            sections.append("")
        else:
            sections.append(f"== NEWS SENTIMENT == Error: {news_data['error']}\n")

        holding_instruction = self._get_holding_term_instruction(task.holding_term)
        sections.append(
            f"Risk Parameters: Level={task.risk_level.value}, "
            f"Max Risk={risk_config['max_risk_percent']}%, "
            f"Max Position={task.max_position_size or 'default'}"
        )
        sections.append(f"Holding Term: {task.holding_term.value} — {holding_instruction}")
        sections.append(
            "\nBased on all specialist analyses above, provide your final recommendation."
        )

        if custom_instructions := self._get_symbol_scoped_custom_instructions(task, symbol):
            sections.append(f"\nAdditional instructions: {custom_instructions}")

        return "\n".join(sections)

    def _build_analysis_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build analysis prompt for agent."""
        holding_instruction = self._get_holding_term_instruction(task.holding_term)
        prompt = (
            f"Analyze {symbol} and provide a market analysis.\n"
            f"Holding Term: {task.holding_term.value} — {holding_instruction}"
        )

        if custom_instructions := self._get_symbol_scoped_custom_instructions(task, symbol):
            prompt += f"\n\nAdditional context: {custom_instructions}"

        prompt += self._modification_hint(task)
        return prompt

    def _build_trading_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build trading prompt with risk parameters."""
        risk_config = self._get_risk_config(task.risk_level)

        holding_instruction = self._get_holding_term_instruction(task.holding_term)

        prompt = f"""Analyze {symbol} for a potential trade opportunity.

Risk Parameters:
- Risk Level: {task.risk_level.value}
- Max Risk per Trade: {risk_config["max_risk_percent"]}%
- Max Position Size: {task.max_position_size or "Use default sizing"}
- Holding Term: {task.holding_term.value} — {holding_instruction}

Provide:
1. Market analysis
2. Trade recommendation (BUY, SELL, or HOLD/WAIT)
3. If trading: entry price, stop loss, take profit, position size
4. Confidence level (0-100%)
5. Key factors for the decision"""

        if custom_instructions := self._get_symbol_scoped_custom_instructions(task, symbol):
            prompt += f"\n\nAdditional instructions: {custom_instructions}"

        prompt += self._modification_hint(task)
        return prompt

    def _modification_hint(self, task: AgentTask) -> str:
        """Append modify_task hint if task self-modification is enabled."""
        if task.task_modification_mode == TaskModificationMode.DISABLED:
            return ""
        mode = task.task_modification_mode.value
        return (
            f"\n\n[Task Self-Modification: {mode} mode] "
            "You can modify this task's configuration using the modify_task tool "
            "when market conditions warrant changes. "
            f"Current config: symbols={task.symbols}, "
            f"risk_level={task.risk_level.value}, "
            f"holding_term={task.holding_term.value}, "
            f"max_position_size={task.max_position_size}, "
            f"max_daily_trades={task.max_daily_trades}."
        )

    def _get_symbol_scoped_custom_instructions(
        self,
        task: AgentTask,
        symbol: str,
    ) -> str:
        """Return only the task instructions relevant to the active symbol."""
        instructions = (task.custom_instructions or "").strip()
        if not instructions:
            return ""

        symbol_aliases = self._build_symbol_aliases(task.symbols)
        current_aliases = symbol_aliases.get(symbol, {symbol.upper()})

        scoped_sections: list[str] = []
        for section in self._split_instruction_sections(instructions):
            heading = section["heading"]
            normalized_heading = heading.lower()
            section_text = section["text"]
            referenced_symbols = {
                candidate
                for candidate, aliases in symbol_aliases.items()
                if any(alias in normalized_heading for alias in aliases)
            }

            if not referenced_symbols:
                if normalized_heading in _TASK_INSTRUCTION_GENERIC_HEADINGS:
                    scoped_sections.append(section_text)
                    continue

                if "watchlist" in normalized_heading:
                    scoped_sections.append(section_text)
                    continue

                if any(alias in normalized_heading for alias in current_aliases):
                    scoped_sections.append(section_text)
                    continue

                if "position monitoring" not in normalized_heading:
                    scoped_sections.append(section_text)
                continue

            if symbol in referenced_symbols:
                scoped_sections.append(section_text)

        return "\n\n".join(scoped_sections).strip()

    @staticmethod
    def _split_instruction_sections(instructions: str) -> list[dict[str, str]]:
        """Split markdown task instructions into heading-based sections."""
        sections: list[dict[str, str]] = []
        current_heading = ""
        current_lines: list[str] = []

        for line in instructions.splitlines():
            if line.startswith("## "):
                if current_lines:
                    sections.append(
                        {
                            "heading": current_heading,
                            "text": "\n".join(current_lines).strip(),
                        }
                    )
                current_heading = line[3:].strip()
                current_lines = [line]
                continue
            current_lines.append(line)

        if current_lines:
            sections.append(
                {
                    "heading": current_heading,
                    "text": "\n".join(current_lines).strip(),
                }
            )
        return sections

    @staticmethod
    def _build_symbol_aliases(symbols: list[str]) -> dict[str, set[str]]:
        """Build a lowercase alias set per task symbol for prompt scoping."""
        aliases: dict[str, set[str]] = {}
        for symbol in symbols:
            normalized = symbol.upper()
            base_asset = normalized.split("-")[0]
            aliases[symbol] = {
                normalized.lower(),
                base_asset.lower(),
            }
        return aliases

    def _get_risk_config(self, risk_level: RiskLevel) -> dict:
        """Get risk configuration based on risk level."""
        configs = {
            RiskLevel.CONSERVATIVE: {"max_risk_percent": 1.5, "min_confidence": 75},
            RiskLevel.MODERATE: {"max_risk_percent": 3.0, "min_confidence": 65},
            RiskLevel.AGGRESSIVE: {"max_risk_percent": 7.5, "min_confidence": 55},
        }
        return configs.get(risk_level, configs[RiskLevel.MODERATE])

    def _get_holding_term_instruction(self, holding_term: HoldingTerm) -> str:
        """Return strategy guidance based on the configured holding term."""
        instructions = {
            HoldingTerm.SHORT: (
                "Focus on momentum plays, breakout patterns, and quick scalps. "
                "Target holding periods under 7 days."
            ),
            HoldingTerm.MEDIUM: (
                "Focus on swing trading and trend following. Target holding periods of 7-30 days."
            ),
            HoldingTerm.LONG: (
                "Focus on fundamental analysis and accumulation. "
                "Target holding periods over 30 days."
            ),
        }
        return instructions.get(holding_term, instructions[HoldingTerm.MEDIUM])

    def _parse_action(self, action_str: str | None) -> DecisionAction | None:
        """Parse action string to DecisionAction enum."""
        if not action_str:
            return None

        action_map = {
            "buy": DecisionAction.BUY,
            "sell": DecisionAction.SELL,
            "hold": DecisionAction.HOLD,
            "wait": DecisionAction.WAIT,
            "close": DecisionAction.CLOSE,
        }
        return action_map.get(action_str.lower())

    async def pause_all_tasks(self) -> int:
        """Pause all active tasks, unschedule jobs, cancel in-flight runs, and
        halt the strategy-discovery periodic job.

        Flips the `AppSettings.emergency_stop_active` latch first so the
        discovery predicate evaluates False on any concurrent re-register,
        then yanks the job from the scheduler for immediate effect.

        Returns the number of tasks whose status was flipped to PAUSED.
        """
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
        app_settings.emergency_stop_active = True
        await app_settings.save_with_timestamp()

        tasks = await AgentTask.find(AgentTask.status == TaskStatus.ACTIVE).to_list()
        paused = 0
        for task in tasks:
            try:
                task.pause(by_emergency=True)
                await task.save()
                self._remove_task_jobs(str(task.id))
                paused += 1
            except Exception:
                logger.exception("Failed to pause task %s during emergency stop", task.id)

        # Drop agent-adjacent periodics now; session cleanup is DB maintenance, keep it.
        self._periodic_jobs.unregister(AUTO_DISCOVER_JOB_ID)
        self._periodic_jobs.unregister(PATTERN_MINING_JOB_ID)

        # Hard-cancel any currently-executing task coroutines (interrupts mid-symbol,
        # including a live Claude streaming call).
        cancelled = 0
        for task_id, info in list(self._running_tasks.items()):
            info["aborted"] = True
        for task_id, runner in list(self._task_runners.items()):
            if not runner.done():
                runner.cancel()
                cancelled += 1
                logger.info("Emergency stop: cancelled running task %s", task_id)

        logger.info(
            "Emergency stop: paused %d of %d active tasks, cancelled %d in-flight run(s), "
            "unregistered strategy discovery",
            paused,
            len(tasks),
            cancelled,
        )
        return paused

    async def resume_all_tasks(self) -> int:
        """Revive tasks that emergency-stop paused, clear the latch, and
        re-register strategy discovery.

        Only tasks flagged `paused_by_emergency_stop` are resumed — user- and
        failure-paused tasks stay paused.
        """
        from app.db.models.app_settings import AppSettings

        emergency_paused = await AgentTask.find(
            AgentTask.status == TaskStatus.PAUSED,
            AgentTask.paused_by_emergency_stop == True,  # noqa: E712
        ).to_list()

        resumed = 0
        for task in emergency_paused:
            try:
                task.resume()  # clears paused_by_emergency_stop + sets ACTIVE
                await task.save()
                await self.schedule_task(task)
                resumed += 1
            except Exception:
                logger.exception("Failed to resume task %s after emergency stop", task.id)

        app_settings = await AppSettings.get_instance()
        app_settings.emergency_stop_active = False
        await app_settings.save_with_timestamp()

        # Re-register discovery + pattern mining based on current settings
        # (no-op if the user had either toggle off to begin with).
        await self.reschedule_auto_discovery()
        await self.reschedule_pattern_mining()

        logger.info(
            "Emergency stop lifted: resumed %d of %d paused-by-emergency task(s), "
            "re-registered strategy discovery and pattern mining",
            resumed,
            len(emergency_paused),
        )
        return resumed

    async def unschedule_task(self, task_id: str) -> None:
        """Remove all jobs for a task from the scheduler."""
        self._remove_task_jobs(task_id)
        logger.info(f"Unscheduled task {task_id}")

    async def run_task_now(self, task_id: str) -> None:
        """Fire-and-forget: schedule immediate execution as a background task.

        Raises RuntimeError when the emergency-stop latch is set so non-HTTP
        callers (tray menu, internal reruns) get a clear signal. HTTP callers
        use `require_emergency_stop_off` dep and never hit this guard.
        """
        if await is_emergency_stopped():
            raise RuntimeError(EMERGENCY_STOP_MESSAGE)
        asyncio.create_task(self._execute_task(task_id))

    @staticmethod
    def _make_task_event_emitter(user_id: PydanticObjectId, session_id: str) -> Callable:
        """Create a callback that broadcasts agent events to the user's WebSocket."""

        async def emit(event: dict) -> None:
            from app.api.websocket.connection_manager import manager

            channel = f"agent:chat:{agent_channel_user_id(user_id)}"
            event["session_id"] = session_id
            await manager.broadcast_to_channel(channel, event)

        return emit

    def is_task_running(self, task_id: str) -> bool:
        return task_id in self._running_tasks

    def get_task_progress(self, task_id: str) -> dict | None:
        return self._running_tasks.get(task_id)

    def get_status(self) -> dict[str, Any]:
        """Get scheduler status."""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": (job.next_run_time.isoformat() if job.next_run_time else None),
                }
            )

        return {
            "running": self._running,
            "jobs": jobs,
        }


# Global scheduler instance
_scheduler: AgentTaskScheduler | None = None


def get_scheduler() -> AgentTaskScheduler:
    """Get the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = AgentTaskScheduler()
    return _scheduler
