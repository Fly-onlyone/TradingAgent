"""Agent task scheduler for scheduled trading operations."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from beanie import PydanticObjectId

from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    DecisionType,
    ExecutionStatus,
)
from app.db.models.agent_task import (
    AgentMode,
    AgentTask,
    MonitoringConditionType,
    RiskLevel,
    TaskFrequency,
    TaskModificationMode,
    TaskSchedule,
    TaskStatus,
)
from app.db.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)


class AgentTaskScheduler:
    """Schedules and manages agent trading tasks."""

    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()
        self._running = False
        self._trading_agent = None  # Lazy load to avoid circular imports

    def _get_trading_agent(self):
        """Lazy load trading agent to avoid circular imports."""
        if self._trading_agent is None:
            from app.agent.trading_agent import TradingAgent

            self._trading_agent = TradingAgent()
        return self._trading_agent

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

    async def _execute_with_retry(
        self,
        fn: Callable[[], Awaitable[Any]],
        max_retries: int = 2,
    ) -> Any:
        """Execute an async callable with exponential backoff on transient errors."""
        for attempt in range(max_retries + 1):
            try:
                return await fn()
            except self._RETRYABLE_ERRORS as e:
                if attempt == max_retries:
                    raise
                wait = 2**attempt * 5  # 5s, 10s, 20s …
                logger.warning(
                    "Retry %d/%d after transient error: %s (waiting %ds)",
                    attempt + 1,
                    max_retries,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)

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
            self._schedule_session_cleanup(),
            self._schedule_auto_discovery(),
        )

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        self.scheduler.shutdown(wait=False)

        if self._trading_agent:
            try:
                await self._trading_agent.disconnect()
            except Exception as exc:
                logger.warning("Error disconnecting scheduler trading agent: %s", exc)

        logger.info("Agent task scheduler stopped")

    async def _schedule_auto_discovery(self) -> None:
        """Schedule or remove the strategy auto-discovery job based on settings."""
        from app.db.models.app_settings import AppSettings

        job_id = "auto_discover_strategies"

        try:
            app_settings = await AppSettings.get_instance()
        except Exception:
            logger.debug("Could not load AppSettings for auto-discovery", exc_info=True)
            return

        # Remove existing job if present
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        if not app_settings.auto_discover_enabled:
            return

        hours = max(1, app_settings.auto_discover_interval_hours)
        self.scheduler.add_job(
            self._run_strategy_discovery,
            IntervalTrigger(hours=hours),
            id=job_id,
            name="Strategy auto-discovery",
            replace_existing=True,
        )
        logger.info("Strategy auto-discovery scheduled every %d hours", hours)

    async def _run_strategy_discovery(self) -> None:
        """Execute one strategy discovery cycle."""
        from app.services.strategy_discovery import StrategyDiscoveryService

        with sentry_sdk.start_transaction(op="task", name="strategy-discovery"):
            try:
                service = StrategyDiscoveryService()
                stats = await service.run_discovery_cycle()
                logger.info("Strategy discovery stats: %s", stats)
            except Exception:
                logger.exception("Strategy auto-discovery cycle failed")

    async def reschedule_auto_discovery(self) -> None:
        """Public method to reschedule after settings change."""
        if self._running:
            await self._schedule_auto_discovery()

    async def _schedule_session_cleanup(self) -> None:
        """Schedule or remove the session retention cleanup job based on settings."""
        from app.db.models.app_settings import AppSettings

        job_id = "cleanup_old_sessions"

        try:
            app_settings = await AppSettings.get_instance()
        except Exception:
            logger.debug("Could not load AppSettings for session cleanup", exc_info=True)
            return

        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        if app_settings.session_retention_days <= 0:
            return

        self.scheduler.add_job(
            self._cleanup_old_sessions,
            IntervalTrigger(hours=6),
            id=job_id,
            name="Cleanup old chat sessions",
            replace_existing=True,
        )
        logger.info(
            "Session cleanup scheduled (retention=%d days)",
            app_settings.session_retention_days,
        )

    async def _cleanup_old_sessions(self) -> None:
        """Delete chat sessions older than the configured retention period."""
        from app.db.models.agent_session import AgentSession
        from app.db.models.app_settings import AppSettings

        with sentry_sdk.start_transaction(op="task", name="session-cleanup"):
            try:
                app_settings = await AppSettings.get_instance()
                days = app_settings.session_retention_days
                if days <= 0:
                    return

                cutoff = datetime.now(UTC) - timedelta(days=days)

                # Delete sessions whose last activity is before the cutoff
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
                        await session.delete()
                    logger.info(
                        "Cleaned up %d old sessions (retention=%d days)", len(old_sessions), days
                    )
            except Exception:
                logger.exception("Session cleanup failed")

    async def reschedule_session_cleanup(self) -> None:
        """Public method to reschedule after settings change."""
        if self._running:
            await self._schedule_session_cleanup()

    async def _load_active_tasks(self) -> None:
        """Load all active tasks from database and schedule them."""
        tasks = await AgentTask.find(AgentTask.status == TaskStatus.ACTIVE).to_list()
        logger.info(f"Loading {len(tasks)} active tasks")

        for task in tasks:
            try:
                await self.schedule_task(task)
            except Exception as e:
                logger.error(f"Error scheduling task {task.id}: {e}")

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
            task.next_run_at = earliest_next_run
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

        elif schedule.frequency == TaskFrequency.HOURLY:
            return IntervalTrigger(hours=1)

        elif schedule.frequency == TaskFrequency.DAILY:
            if schedule.scheduled_time:
                hour, minute = map(int, schedule.scheduled_time.split(":"))
            else:
                hour, minute = 9, 0

            return CronTrigger(hour=hour, minute=minute, timezone=timezone)

        elif schedule.frequency == TaskFrequency.WEEKLY:
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

    async def _execute_task(self, task_id: str) -> None:
        """Execute a scheduled task."""
        logger.info(f"Executing task {task_id}")

        with sentry_sdk.start_transaction(op="task", name="agent-task-execution") as txn:
            txn.set_tag("task_id", task_id)
            try:
                task = await AgentTask.get(PydanticObjectId(task_id))
                if not task:
                    logger.error(f"Task {task_id} not found")
                    return

                if task.status != TaskStatus.ACTIVE:
                    logger.info(f"Task {task_id} is not active, skipping")
                    return

                txn.set_tag("task_name", task.name)
                txn.set_tag("trading_enabled", str(task.trading_enabled))
                txn.set_tag("monitoring_enabled", str(task.monitoring_enabled))

                # Execute based on capability toggles (analysis is always the base)
                if task.trading_enabled:
                    await self._execute_trading_task(task)
                else:
                    await self._execute_analysis_task(task)

                if task.monitoring_enabled:
                    await self._execute_monitoring_task(task)

                # Mark as completed if all schedules are one-time
                all_once = all(s.frequency == TaskFrequency.ONCE for s in task.schedules)
                if all_once:
                    task.complete()
                    await task.save()
                    self._remove_task_jobs(str(task.id))

            except Exception as e:
                logger.error(f"Error executing task {task_id}: {e}")
                # Record failure
                task = await AgentTask.get(PydanticObjectId(task_id))
                if task:
                    task.record_execution(success=False, error=str(e))
                await self._check_auto_pause(task)
                await task.save()

    async def _execute_analysis_task(self, task: AgentTask) -> None:
        """Execute an analysis-only task."""
        agent = self._get_trading_agent()

        for symbol in task.symbols:
            try:
                # Build prompt — optionally enriched with subagent results
                subagent_context = None
                if task.use_subagents:
                    logger.info("Running subagent analysis for %s", symbol)
                    subagent_context = await self._run_subagent_analysis(symbol, task)
                    prompt = self._build_enriched_prompt(symbol, task, subagent_context)
                else:
                    prompt = self._build_analysis_prompt(symbol, task)

                # Set task context for modify_task tool
                request_id = f"task-{task.id}-{symbol}"
                self._set_modification_context(request_id, task)

                # Run agent analysis with retry on transient errors
                try:
                    result = await self._execute_with_retry(
                        lambda: agent.analyze(
                            user_message=prompt,
                            user_id=str(task.user_id),
                        ),
                        max_retries=task.max_retries,
                    )
                finally:
                    self._clear_modification_context(request_id)

                # Store decision
                decision = AgentDecision(
                    user_id=task.user_id,
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
                task.record_execution(success=True)
                await task.save()

                logger.info(f"Analysis completed for {symbol}")

            except Exception as e:
                logger.error(f"Error analyzing {symbol}: {e}")
                task.record_execution(success=False, error=str(e))
                await self._check_auto_pause(task)
                await task.save()

    async def _execute_trading_task(self, task: AgentTask) -> None:
        """Execute a trading task (analysis + potential trade)."""
        agent = self._get_trading_agent()
        risk_config = self._get_risk_config(task.risk_level)
        min_confidence = float(risk_config["min_confidence"])

        for symbol in task.symbols:
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
                            f"## Historical Knowledge Context\n{knowledge_ctx}\n\n---\n\n{prompt}"
                        )
                except Exception:
                    logger.debug("Failed to inject knowledge context", exc_info=True)

                # Set task context for modify_task tool
                request_id = f"task-{task.id}-{symbol}"
                self._set_modification_context(request_id, task)

                # Run agent analysis with retry on transient errors
                try:
                    result = await self._execute_with_retry(
                        lambda: agent.analyze(
                            user_message=prompt,
                            user_id=str(task.user_id),
                        ),
                        max_retries=task.max_retries,
                    )
                finally:
                    self._clear_modification_context(request_id)

                action = self._parse_action(result.get("action"))
                confidence = float(result.get("confidence") or 0)

                # Create decision record
                decision = AgentDecision(
                    user_id=task.user_id,
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
                task.record_execution(success=True)
                await task.save()

            except Exception as e:
                logger.error(f"Error in trading task for {symbol}: {e}")
                task.record_execution(success=False, error=str(e))
                await self._check_auto_pause(task)
                await task.save()

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

        for symbol in task.symbols:
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
                        agent = self._get_trading_agent()
                        prompt = (
                            f"Evaluate this condition for {symbol}: "
                            f"{condition.description or 'No description'}. "
                            f"Current price: {current_price}. "
                            "Reply with TRIGGERED or NOT_TRIGGERED and a brief reason."
                        )
                        try:
                            ai_response = await agent.chat(prompt)
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
        agent = self._get_trading_agent()
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

            trade_result = await agent.execute_trade(
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

        sections.append(
            f"Risk Parameters: Level={task.risk_level.value}, "
            f"Max Risk={risk_config['max_risk_percent']}%, "
            f"Max Position={task.max_position_size or 'default'}"
        )
        sections.append(
            "\nBased on all specialist analyses above, provide your final recommendation."
        )

        if task.custom_instructions:
            sections.append(f"\nAdditional instructions: {task.custom_instructions}")

        return "\n".join(sections)

    def _build_analysis_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build analysis prompt for agent."""
        prompt = f"Analyze {symbol} and provide a market analysis."

        if task.custom_instructions:
            prompt += f"\n\nAdditional context: {task.custom_instructions}"

        prompt += self._modification_hint(task)
        return prompt

    def _build_trading_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build trading prompt with risk parameters."""
        risk_config = self._get_risk_config(task.risk_level)

        prompt = f"""Analyze {symbol} for a potential trade opportunity.

Risk Parameters:
- Risk Level: {task.risk_level.value}
- Max Risk per Trade: {risk_config["max_risk_percent"]}%
- Max Position Size: {task.max_position_size or "Use default sizing"}

Provide:
1. Market analysis
2. Trade recommendation (BUY, SELL, or HOLD/WAIT)
3. If trading: entry price, stop loss, take profit, position size
4. Confidence level (0-100%)
5. Key factors for the decision"""

        if task.custom_instructions:
            prompt += f"\n\nAdditional instructions: {task.custom_instructions}"

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
            f"max_position_size={task.max_position_size}, "
            f"max_daily_trades={task.max_daily_trades}."
        )

    def _get_risk_config(self, risk_level: RiskLevel) -> dict:
        """Get risk configuration based on risk level."""
        configs = {
            RiskLevel.CONSERVATIVE: {"max_risk_percent": 1.5, "min_confidence": 75},
            RiskLevel.MODERATE: {"max_risk_percent": 3.0, "min_confidence": 65},
            RiskLevel.AGGRESSIVE: {"max_risk_percent": 7.5, "min_confidence": 55},
        }
        return configs.get(risk_level, configs[RiskLevel.MODERATE])

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

    async def unschedule_task(self, task_id: str) -> None:
        """Remove all jobs for a task from the scheduler."""
        self._remove_task_jobs(task_id)
        logger.info(f"Unscheduled task {task_id}")

    async def run_task_now(self, task_id: str) -> None:
        """Execute a task immediately."""
        await self._execute_task(task_id)

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
