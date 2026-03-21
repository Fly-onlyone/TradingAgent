"""Shared service for confirming and executing agent trade decisions."""

import logging
from datetime import UTC, datetime

from beanie import PydanticObjectId

from app.agent.task_scheduler import get_scheduler
from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    DecisionType,
    ExecutionStatus,
)
from app.db.models.agent_task import AgentTask, coerce_task_changes
from app.db.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)


class AgentExecutionService:
    """Coordinates decision confirmation and trade execution across entrypoints."""

    async def confirm_and_execute_decision(
        self,
        decision_id: PydanticObjectId,
        user_id: PydanticObjectId,
        source: str = "api",
    ) -> AgentDecision:
        """Confirm a pending decision and trigger trade execution."""
        decision = await AgentDecision.find_one(
            AgentDecision.id == decision_id,
            AgentDecision.user_id == user_id,
        )
        if not decision:
            raise ValueError("Decision not found")

        if decision.status != DecisionStatus.PENDING:
            raise RuntimeError(
                f"Decision is not pending (current status: {decision.status.value})"
            )

        if decision.expires_at and datetime.now(UTC) > decision.expires_at:
            decision.expire()
            await decision.save()
            raise TimeoutError("Decision has expired")

        decision.confirm()
        decision.execution_status = ExecutionStatus.SUBMITTED
        await decision.save()

        # Route task modification decisions to a separate handler
        if decision.decision_type == DecisionType.TASK_MODIFICATION:
            return await self._apply_task_modification(decision)

        if decision.action not in {DecisionAction.BUY, DecisionAction.SELL}:
            decision.status = DecisionStatus.EXECUTED
            decision.execution_status = ExecutionStatus.FAILED
            decision.execution_error_code = "invalid_action"
            decision.execution_error_message = "Only BUY/SELL decisions can be executed"
            await decision.save()
            return decision

        if not decision.task_id:
            decision.mark_execution_failed(
                "Decision has no associated task for execution",
                error_code="missing_task",
            )
            await decision.save()
            return decision

        task = await AgentTask.get(decision.task_id)
        if not task:
            decision.mark_execution_failed(
                "Associated task was not found",
                error_code="task_not_found",
            )
            await decision.save()
            return decision

        scheduler = get_scheduler()
        await scheduler.execute_trade_for_decision(
            task=task,
            decision=decision,
            execution_source=source,
        )

        refreshed = await AgentDecision.get(decision.id)
        return refreshed or decision

    async def _apply_task_modification(self, decision: AgentDecision) -> AgentDecision:
        """Apply proposed task changes from a confirmed TASK_MODIFICATION decision."""
        if not decision.task_id:
            decision.mark_execution_failed(
                "No associated task", error_code="missing_task"
            )
            await decision.save()
            return decision

        task = await AgentTask.get(decision.task_id)
        if not task:
            decision.mark_execution_failed(
                "Task not found", error_code="task_not_found"
            )
            await decision.save()
            return decision

        proposed = decision.proposed_changes or {}
        after = proposed.get("after", {})

        if not after:
            decision.mark_execution_failed(
                "No changes to apply", error_code="empty_changes"
            )
            await decision.save()
            return decision

        try:
            coerced_changes = coerce_task_changes(after)
        except (TypeError, ValueError) as exc:
            decision.mark_execution_failed(
                f"Invalid task changes: {exc}",
                error_code="invalid_changes",
            )
            await decision.save()
            return decision

        # Apply each field change
        changed_fields = []
        for field_name, new_value in coerced_changes.items():
            setattr(task, field_name, new_value)
            changed_fields.append(field_name)

        task.update_timestamp()
        await task.save()

        # Reschedule if schedules changed
        if "schedules" in coerced_changes:
            try:
                scheduler = get_scheduler()
                await scheduler.schedule_task(task)
            except Exception:
                logger.warning("Failed to reschedule after modification", exc_info=True)

        # Mark decision as executed
        decision.status = DecisionStatus.EXECUTED
        decision.execution_status = ExecutionStatus.FILLED
        decision.executed_at = datetime.now(UTC)
        await decision.save()

        # Notify user
        notification = Notification(
            user_id=decision.user_id,
            notification_type=NotificationType.TASK_MODIFICATION_APPLIED,
            title="Task changes applied",
            message=f"Modified: {', '.join(changed_fields)}",
            related_task_id=decision.task_id,
            related_decision_id=decision.id,
        )
        await notification.insert()

        logger.info(
            "Task %s modification applied: %s", decision.task_id, changed_fields
        )
        return decision


_agent_execution_service: AgentExecutionService | None = None


def get_agent_execution_service() -> AgentExecutionService:
    """Get the singleton execution service."""
    global _agent_execution_service
    if _agent_execution_service is None:
        _agent_execution_service = AgentExecutionService()
    return _agent_execution_service
