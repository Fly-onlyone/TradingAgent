"""Shared service for confirming and executing agent trade decisions."""

from datetime import datetime, timezone, UTC

from beanie import PydanticObjectId

from app.agent.task_scheduler import get_scheduler
from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    ExecutionStatus,
)
from app.db.models.agent_task import AgentTask


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
            raise RuntimeError(f"Decision is not pending (current status: {decision.status.value})")

        if decision.expires_at and datetime.now(UTC) > decision.expires_at:
            decision.expire()
            await decision.save()
            raise TimeoutError("Decision has expired")

        decision.confirm()
        decision.execution_status = ExecutionStatus.SUBMITTED
        await decision.save()

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


_agent_execution_service: AgentExecutionService | None = None


def get_agent_execution_service() -> AgentExecutionService:
    """Get the singleton execution service."""
    global _agent_execution_service
    if _agent_execution_service is None:
        _agent_execution_service = AgentExecutionService()
    return _agent_execution_service
