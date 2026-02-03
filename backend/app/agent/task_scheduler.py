"""Agent task scheduler for scheduled trading operations."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from beanie import PydanticObjectId

from app.db.models.agent_task import (
    AgentMode,
    AgentTask,
    RiskLevel,
    TaskFrequency,
    TaskStatus,
    TaskType,
)
from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    DecisionType,
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

    async def start(self) -> None:
        """Start the scheduler and load active tasks."""
        if self._running:
            return

        self._running = True
        self.scheduler.start()
        logger.info("Agent task scheduler started")

        # Load and schedule all active tasks
        await self._load_active_tasks()

        # Add cleanup job for expired notifications
        self.scheduler.add_job(
            self._cleanup_expired_notifications,
            IntervalTrigger(minutes=5),
            id="cleanup_notifications",
            name="Cleanup expired notifications",
            replace_existing=True,
        )

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        self.scheduler.shutdown(wait=False)
        logger.info("Agent task scheduler stopped")

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
        """Schedule a task for execution."""
        job_id = f"task_{task.id}"

        # Remove existing job if any
        existing_job = self.scheduler.get_job(job_id)
        if existing_job:
            self.scheduler.remove_job(job_id)

        # Determine trigger based on frequency
        trigger = self._create_trigger(task)
        if trigger is None:
            logger.warning(f"Could not create trigger for task {task.id}")
            return

        # Schedule the job
        self.scheduler.add_job(
            self._execute_task,
            trigger,
            args=[str(task.id)],
            id=job_id,
            name=task.name,
            replace_existing=True,
        )

        # Calculate and store next run time
        if task.frequency != TaskFrequency.ONCE:
            next_run = trigger.get_next_fire_time(None, datetime.now(timezone.utc))
            task.next_run_at = next_run
            await task.save()

        logger.info(f"Scheduled task {task.name} ({task.id})")

    def _create_trigger(self, task: AgentTask):
        """Create APScheduler trigger from task configuration."""
        if task.frequency == TaskFrequency.ONCE:
            # Run once at next_run_at or immediately
            run_at = task.next_run_at or datetime.now(timezone.utc) + timedelta(
                seconds=5
            )
            return DateTrigger(run_date=run_at)

        elif task.frequency == TaskFrequency.HOURLY:
            return IntervalTrigger(hours=1)

        elif task.frequency == TaskFrequency.DAILY:
            # Parse scheduled_time (HH:MM)
            if task.scheduled_time:
                hour, minute = map(int, task.scheduled_time.split(":"))
            else:
                hour, minute = 9, 0  # Default to 9:00 AM

            return CronTrigger(hour=hour, minute=minute, timezone=task.timezone)

        elif task.frequency == TaskFrequency.WEEKLY:
            if task.scheduled_time:
                hour, minute = map(int, task.scheduled_time.split(":"))
            else:
                hour, minute = 9, 0

            day_of_week = task.day_of_week if task.day_of_week is not None else 0
            return CronTrigger(
                day_of_week=day_of_week,
                hour=hour,
                minute=minute,
                timezone=task.timezone,
            )

        elif task.frequency == TaskFrequency.CUSTOM:
            if task.cron_expression:
                return CronTrigger.from_crontab(
                    task.cron_expression, timezone=task.timezone
                )
            else:
                logger.error(f"Custom frequency task {task.id} missing cron_expression")
                return None

        return None

    async def _execute_task(self, task_id: str) -> None:
        """Execute a scheduled task."""
        logger.info(f"Executing task {task_id}")

        try:
            task = await AgentTask.get(PydanticObjectId(task_id))
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            if task.status != TaskStatus.ACTIVE:
                logger.info(f"Task {task_id} is not active, skipping")
                return

            # Execute based on task type
            if task.task_type == TaskType.ANALYSIS:
                await self._execute_analysis_task(task)
            elif task.task_type == TaskType.TRADING:
                await self._execute_trading_task(task)
            elif task.task_type == TaskType.MONITORING:
                await self._execute_monitoring_task(task)

            # Mark as completed if one-time task
            if task.frequency == TaskFrequency.ONCE:
                task.complete()
                await task.save()
                # Remove from scheduler
                self.scheduler.remove_job(f"task_{task.id}")

        except Exception as e:
            logger.error(f"Error executing task {task_id}: {e}")
            # Record failure
            task = await AgentTask.get(PydanticObjectId(task_id))
            if task:
                task.record_execution(success=False, error=str(e))
                await task.save()

    async def _execute_analysis_task(self, task: AgentTask) -> None:
        """Execute an analysis-only task."""
        agent = self._get_trading_agent()

        for symbol in task.symbols:
            try:
                # Build analysis prompt
                prompt = self._build_analysis_prompt(symbol, task)

                # Run agent analysis
                result = await agent.analyze(
                    user_message=prompt,
                    user_id=str(task.user_id),
                )

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
                await task.save()

    async def _execute_trading_task(self, task: AgentTask) -> None:
        """Execute a trading task (analysis + potential trade)."""
        agent = self._get_trading_agent()

        for symbol in task.symbols:
            try:
                # Build trading prompt with risk parameters
                prompt = self._build_trading_prompt(symbol, task)

                # Run agent analysis
                result = await agent.analyze(
                    user_message=prompt,
                    user_id=str(task.user_id),
                )

                action = self._parse_action(result.get("action"))
                confidence = result.get("confidence", 0)

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
                )

                # Determine if we should trade
                should_trade = action in [DecisionAction.BUY, DecisionAction.SELL]

                if should_trade:
                    if task.agent_mode == AgentMode.AUTO:
                        # Auto mode: execute immediately
                        decision.status = DecisionStatus.CONFIRMED
                        await decision.insert()
                        await self._execute_trade(task, decision, result)
                    else:
                        # Ask mode: create notification and wait for confirmation
                        decision.status = DecisionStatus.PENDING
                        decision.expires_at = datetime.now(timezone.utc) + timedelta(
                            hours=1
                        )
                        await decision.insert()
                        await self._create_trade_confirmation_notification(
                            task, decision
                        )
                else:
                    decision.status = DecisionStatus.EXECUTED
                    await decision.insert()

                task.last_decision_id = decision.id
                task.record_execution(success=True)
                await task.save()

            except Exception as e:
                logger.error(f"Error in trading task for {symbol}: {e}")
                task.record_execution(success=False, error=str(e))
                await task.save()

    async def _execute_monitoring_task(self, task: AgentTask) -> None:
        """Execute a monitoring task (price/condition alerts)."""
        # TODO: Implement price monitoring and alerts
        logger.info(f"Monitoring task {task.id} - not yet implemented")
        task.record_execution(success=True)
        await task.save()

    async def _execute_trade(
        self, task: AgentTask, decision: AgentDecision, result: dict
    ) -> None:
        """Execute a trade based on agent decision."""
        agent = self._get_trading_agent()

        try:
            # Execute the trade
            trade_result = await agent.execute_trade(
                user_id=str(task.user_id),
                symbol=decision.symbol,
                action=decision.action.value,
                position_size=decision.suggested_position_size,
                stop_loss=decision.suggested_stop_loss,
                take_profit=decision.suggested_take_profit,
                reasoning=decision.reasoning,
            )

            if trade_result.get("success"):
                decision.mark_executed(
                    order_id=PydanticObjectId(trade_result["order_id"]),
                    price=trade_result.get("execution_price", 0),
                )
                decision.decision_type = DecisionType.TRADE_EXECUTION
                await decision.save()

                # Send execution notification
                await self._create_trade_executed_notification(task, decision)

                logger.info(f"Trade executed for {decision.symbol}")
            else:
                logger.error(f"Trade execution failed: {trade_result.get('error')}")

        except Exception as e:
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
        now = datetime.now(timezone.utc)

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

    def _build_analysis_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build analysis prompt for agent."""
        prompt = f"Analyze {symbol} and provide a market analysis."

        if task.custom_instructions:
            prompt += f"\n\nAdditional context: {task.custom_instructions}"

        return prompt

    def _build_trading_prompt(self, symbol: str, task: AgentTask) -> str:
        """Build trading prompt with risk parameters."""
        risk_config = self._get_risk_config(task.risk_level)

        prompt = f"""Analyze {symbol} for a potential trade opportunity.

Risk Parameters:
- Risk Level: {task.risk_level.value}
- Max Risk per Trade: {risk_config['max_risk_percent']}%
- Max Position Size: {task.max_position_size or 'Use default sizing'}

Provide:
1. Market analysis
2. Trade recommendation (BUY, SELL, or HOLD/WAIT)
3. If trading: entry price, stop loss, take profit, position size
4. Confidence level (0-100%)
5. Key factors for the decision"""

        if task.custom_instructions:
            prompt += f"\n\nAdditional instructions: {task.custom_instructions}"

        return prompt

    def _get_risk_config(self, risk_level: RiskLevel) -> dict:
        """Get risk configuration based on risk level."""
        configs = {
            RiskLevel.CONSERVATIVE: {"max_risk_percent": 1.5, "min_confidence": 75},
            RiskLevel.MODERATE: {"max_risk_percent": 3.0, "min_confidence": 65},
            RiskLevel.AGGRESSIVE: {"max_risk_percent": 7.5, "min_confidence": 55},
        }
        return configs.get(risk_level, configs[RiskLevel.MODERATE])

    def _parse_action(self, action_str: Optional[str]) -> Optional[DecisionAction]:
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
        """Remove a task from the scheduler."""
        job_id = f"task_{task_id}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
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
                    "next_run": (
                        job.next_run_time.isoformat() if job.next_run_time else None
                    ),
                }
            )

        return {
            "running": self._running,
            "jobs": jobs,
        }


# Global scheduler instance
_scheduler: Optional[AgentTaskScheduler] = None


def get_scheduler() -> AgentTaskScheduler:
    """Get the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = AgentTaskScheduler()
    return _scheduler
