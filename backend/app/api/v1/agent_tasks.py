"""Agent task management endpoints."""

import logging
from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.api.deps import get_current_superuser
from app.api.v1.auth import get_current_active_user
from app.db.models.agent_decision import AgentDecision
from app.db.models.agent_task import (
    AgentMode,
    AgentTask,
    IntervalUnit,
    MonitoringCondition,
    MonitoringConditionType,
    RiskLevel,
    TaskFrequency,
    TaskModificationMode,
    TaskSchedule,
    TaskStatus,
)
from app.db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response schemas
class MonitoringConditionSchema(BaseModel):
    """Schema for a monitoring condition."""

    condition_type: MonitoringConditionType
    threshold: float
    timeframe: str | None = None
    description: str | None = None


class TaskScheduleSchema(BaseModel):
    """Schema for a single schedule entry."""

    frequency: TaskFrequency
    cron_expression: str | None = None
    scheduled_time: str | None = None  # HH:MM
    day_of_week: int | None = Field(None, ge=0, le=6)
    enabled: bool = True
    interval_value: int | None = Field(None, ge=1)
    interval_unit: IntervalUnit | None = None


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None

    # Capability toggles
    trading_enabled: bool = False
    monitoring_enabled: bool = False

    # Schedules
    schedules: list[TaskScheduleSchema] = Field(..., min_length=1)
    timezone: str = "UTC"

    # Trading parameters
    symbols: list[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.MODERATE
    agent_mode: AgentMode = AgentMode.ASK
    task_modification_mode: TaskModificationMode = TaskModificationMode.DISABLED
    max_position_size: float | None = None
    max_daily_trades: int | None = None

    # Monitoring parameters
    monitoring_conditions: list[MonitoringConditionSchema] = Field(default_factory=list)
    alert_cooldown_minutes: int = Field(60, ge=5, le=1440)

    # Subagent configuration
    use_subagents: bool = False

    # Custom instructions
    custom_instructions: str | None = None


class TaskUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None

    # Capability toggles
    trading_enabled: bool | None = None
    monitoring_enabled: bool | None = None

    # Schedules
    schedules: list[TaskScheduleSchema] | None = None
    timezone: str | None = None

    # Trading parameters
    symbols: list[str] | None = None
    risk_level: RiskLevel | None = None
    agent_mode: AgentMode | None = None
    task_modification_mode: TaskModificationMode | None = None
    max_position_size: float | None = None
    max_daily_trades: int | None = None

    # Monitoring parameters
    monitoring_conditions: list[MonitoringConditionSchema] | None = None
    alert_cooldown_minutes: int | None = Field(None, ge=5, le=1440)

    # Subagent configuration
    use_subagents: bool | None = None

    # Custom instructions
    custom_instructions: str | None = None


class TaskResponse(BaseModel):
    id: str
    name: str
    description: str | None

    # Capability toggles
    trading_enabled: bool
    monitoring_enabled: bool

    # Schedule
    schedules: list[TaskScheduleSchema]
    timezone: str
    next_run_at: datetime | None
    last_run_at: datetime | None

    # Trading parameters
    symbols: list[str]
    risk_level: str
    agent_mode: str
    task_modification_mode: str
    max_position_size: float | None
    max_daily_trades: int | None
    custom_instructions: str | None

    # Monitoring
    monitoring_conditions: list[MonitoringConditionSchema]
    alert_cooldown_minutes: int

    # Subagents
    use_subagents: bool

    # Status
    status: str
    run_count: int
    success_count: int
    failure_count: int
    last_error: str | None
    last_decision_id: str | None = None
    last_session_id: str | None = None

    # Running state
    is_running: bool = False
    running_progress: dict | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Paginated task list response."""

    tasks: list[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskExecutionResponse(BaseModel):
    """Task execution history item."""

    id: str
    task_id: str
    session_id: str | None = None
    decision_type: str
    symbol: str | None
    action: str | None
    confidence: float | None
    summary: str
    reasoning: str | None = None
    key_factors: list[str] = []
    status: str
    created_at: datetime


class TaskExecutionListResponse(BaseModel):
    """Paginated task execution history."""

    executions: list[TaskExecutionResponse]
    total: int
    page: int
    page_size: int


def task_to_response(task: AgentTask) -> TaskResponse:
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    task_id = str(task.id)

    return TaskResponse(
        id=task_id,
        name=task.name,
        description=task.description,
        trading_enabled=task.trading_enabled,
        monitoring_enabled=task.monitoring_enabled,
        schedules=[
            TaskScheduleSchema(
                frequency=s.frequency,
                cron_expression=s.cron_expression,
                scheduled_time=s.scheduled_time,
                day_of_week=s.day_of_week,
                enabled=s.enabled,
                interval_value=s.interval_value,
                interval_unit=s.interval_unit,
            )
            for s in task.schedules
        ],
        timezone=task.timezone,
        next_run_at=task.next_run_at,
        last_run_at=task.last_run_at,
        symbols=task.symbols,
        risk_level=task.risk_level.value,
        agent_mode=task.agent_mode.value,
        task_modification_mode=task.task_modification_mode.value,
        max_position_size=task.max_position_size,
        max_daily_trades=task.max_daily_trades,
        custom_instructions=task.custom_instructions,
        monitoring_conditions=[
            MonitoringConditionSchema(
                condition_type=c.condition_type,
                threshold=c.threshold,
                timeframe=c.timeframe,
                description=c.description,
            )
            for c in task.monitoring_conditions
        ],
        alert_cooldown_minutes=task.alert_cooldown_minutes,
        use_subagents=task.use_subagents,
        status=task.status.value,
        run_count=task.run_count,
        success_count=task.success_count,
        failure_count=task.failure_count,
        last_error=task.last_error,
        last_decision_id=str(task.last_decision_id) if task.last_decision_id else None,
        last_session_id=str(task.last_session_id) if task.last_session_id else None,
        is_running=scheduler.is_task_running(task_id),
        running_progress=scheduler.get_task_progress(task_id),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post("", response_model=TaskResponse)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_active_user),
) -> TaskResponse:
    """Create a new scheduled task."""
    # Enforce single-task cap: edit the existing task instead of creating another
    existing_count = await AgentTask.find(AgentTask.user_id == current_user.id).count()
    if existing_count >= 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only one task is allowed. Edit the existing task's description, "
                "symbols, or schedule instead of creating a new one."
            ),
        )

    # Validate each schedule
    for schedule in task_data.schedules:
        if schedule.frequency == TaskFrequency.CUSTOM and not schedule.cron_expression:
            raise HTTPException(
                status_code=400,
                detail="cron_expression is required for custom frequency",
            )

    # Validate symbols when trading or monitoring is enabled
    if (task_data.trading_enabled or task_data.monitoring_enabled) and not task_data.symbols:
        raise HTTPException(
            status_code=400,
            detail="At least one symbol is required when trading or monitoring is enabled",
        )

    # Validate monitoring requires conditions
    if task_data.monitoring_enabled and not task_data.monitoring_conditions:
        raise HTTPException(
            status_code=400,
            detail="Monitoring requires at least one monitoring condition",
        )

    task = AgentTask(
        user_id=current_user.id,
        name=task_data.name,
        description=task_data.description,
        trading_enabled=task_data.trading_enabled,
        monitoring_enabled=task_data.monitoring_enabled,
        schedules=[
            TaskSchedule(
                frequency=s.frequency,
                cron_expression=s.cron_expression,
                scheduled_time=s.scheduled_time,
                day_of_week=s.day_of_week,
                enabled=s.enabled,
                interval_value=s.interval_value,
                interval_unit=s.interval_unit,
            )
            for s in task_data.schedules
        ],
        timezone=task_data.timezone,
        symbols=task_data.symbols,
        risk_level=task_data.risk_level,
        agent_mode=task_data.agent_mode,
        task_modification_mode=task_data.task_modification_mode,
        max_position_size=task_data.max_position_size,
        max_daily_trades=task_data.max_daily_trades,
        monitoring_conditions=[
            MonitoringCondition(
                condition_type=c.condition_type,
                threshold=c.threshold,
                timeframe=c.timeframe,
                description=c.description,
            )
            for c in task_data.monitoring_conditions
        ],
        alert_cooldown_minutes=task_data.alert_cooldown_minutes,
        use_subagents=task_data.use_subagents,
        custom_instructions=task_data.custom_instructions,
    )
    await task.insert()

    # Schedule the task
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.schedule_task(task)

    return task_to_response(task)


class MergeDuplicatesResponse(BaseModel):
    """Response from POST /tasks/merge-duplicates.

    The endpoint returns immediately once the session has been created so the
    frontend can navigate to ``session_id`` and watch the merge stream live.
    The actual AI merge runs in the background.
    """

    merged: bool
    session_id: str | None = None
    message: str


async def _run_merge_in_background(
    user_id: PydanticObjectId,
    task_ids: list[PydanticObjectId],
    session_id: PydanticObjectId,
) -> None:
    """Perform the actual AI merge and broadcast progress to the user's WS.

    Emits ``text_delta`` events (the same shape the chat UI consumes for
    streaming assistant replies) so the user sees live progress while the
    merge runs.
    """
    import asyncio
    from datetime import UTC

    from app.agent.constants import agent_channel_user_id
    from app.agent.task_scheduler import get_scheduler
    from app.api.websocket.connection_manager import manager
    from app.db.models.agent_session import (
        AgentSession,
        persist_session_message_doc,
    )
    from app.services.task_merger import TaskMerger

    channel = f"agent:chat:{agent_channel_user_id(user_id)}"
    session_id_str = str(session_id)

    async def emit_text(content: str) -> None:
        """Stream a chunk as a text_delta (matches trading_agent's on_event shape)."""
        await manager.broadcast_to_channel(
            channel,
            {
                "type": "text_delta",
                "session_id": session_id_str,
                "data": {"content": content},
            },
        )
        # Tiny yield so the WS frame flushes before the next chunk
        await asyncio.sleep(0)

    async def emit_final_message(
        content: str,
        role: str = "assistant",
        message_id: str | None = None,
    ) -> None:
        """Emit a final ``message`` event so the chat UI clears the loading
        spinner and renders the durable message, then invalidate the tasks
        query on the client.

        Passes the DB ``AgentSessionMessage._id`` as the message id so the
        frontend store indexes this bubble by the same key it'll see from
        REST hydration — see `.claude/rules/code-guide.md` "Chat-Session
        Features" leg "Message id on wire".

        Note: this is the ONLY `message` event the merge flow emits. If
        future code adds intermediate `message` events, those MUST set
        ``keep_running: true`` on the outer payload so the sidebar spinner
        doesn't clear prematurely.
        """
        import time
        import uuid

        await manager.broadcast_to_channel(
            channel,
            {
                "type": "message",
                "session_id": session_id_str,
                "data": {
                    "id": message_id or str(uuid.uuid4()),
                    "role": role,
                    "content": content,
                    "timestamp": int(time.time() * 1000),
                },
            },
        )
        # Tell the frontend tasks list to refetch
        await manager.broadcast_to_channel(
            channel,
            {
                "type": "data_event",
                "data": {"category": "tasks", "event": "merged"},
            },
        )

    async def emit_thinking(content: str) -> None:
        """Emit a short thinking block so the UI shows the reasoning pill."""
        await manager.broadcast_to_channel(
            channel,
            {
                "type": "thinking",
                "session_id": session_id_str,
                "data": {"content": content},
            },
        )

    session = await AgentSession.get(session_id)
    if session is None:
        return

    try:
        tasks = await AgentTask.find({"_id": {"$in": task_ids}}).to_list()
        tasks.sort(key=lambda t: t.created_at)

        if len(tasks) < 2:
            await emit_text("No duplicates left to merge.\n")
            return

        # Show the reasoning up front so the user sees *why* the merge is safe
        await emit_thinking(
            f"Consolidating {len(tasks)} duplicate tasks into one. "
            "Plan: take the union of symbols across all sources, concatenate "
            "every custom instruction so price levels / stop-losses / "
            "escalation rules are preserved, OR the capability flags, pick the "
            "most-conservative risk level, and keep the task with the highest "
            "run_count as the anchor (deleting the rest)."
        )

        merger = await TaskMerger.create()
        merged = await merger.merge(tasks)
        used_fallback = getattr(merger, "_last_used_fallback", False)
        if used_fallback:
            await emit_thinking(
                "AI call returned no usable output, so I fell back to the "
                "deterministic rule-based merge. Data preservation is still "
                "guaranteed — every symbol and instruction is kept verbatim."
            )

        keep_idx = max(0, min(merged.preferred_source_index, len(tasks) - 1))
        kept = tasks[keep_idx]
        to_delete = [t for i, t in enumerate(tasks) if i != keep_idx]

        await emit_thinking(
            f"Keeping task `{kept.id}` ({kept.name}) as the anchor because it "
            f"has the most activity (run_count={kept.run_count}, "
            f"{len(kept.symbols)} symbols). Deleting {len(to_delete)} other "
            "task(s) and rescheduling the kept one."
        )

        # Stream the merged result in readable chunks so the UI renders progressively
        await emit_text(f"**Merged task:** {merged.name}\n\n")
        await emit_text(f"**Description:** {merged.description}\n\n")
        await emit_text(f"**Symbols ({len(merged.symbols)}):** {', '.join(merged.symbols)}\n\n")
        await emit_text(f"**Custom instructions:**\n{merged.custom_instructions}\n\n")
        await emit_text(
            f"**Flags:** trading={merged.trading_enabled}, "
            f"monitoring={merged.monitoring_enabled}, "
            f"subagents={merged.use_subagents}, "
            f"risk={merged.risk_level}, mode={merged.agent_mode}\n\n"
        )
        await emit_text(f"Keeping task `{kept.id}`; deleting {len(to_delete)} duplicate(s).\n\n")

        # Apply merged payload
        kept.name = merged.name[:100]
        kept.description = merged.description or None
        kept.symbols = list(merged.symbols)
        kept.custom_instructions = merged.custom_instructions or None
        kept.trading_enabled = merged.trading_enabled
        kept.monitoring_enabled = merged.monitoring_enabled
        kept.use_subagents = merged.use_subagents
        try:
            kept.risk_level = RiskLevel(merged.risk_level)
        except ValueError:
            pass
        try:
            kept.agent_mode = AgentMode(merged.agent_mode)
        except ValueError:
            pass
        kept.max_position_size = merged.max_position_size
        kept.max_daily_trades = merged.max_daily_trades
        await kept.save()

        # Delete duplicates (unschedule first)
        scheduler = get_scheduler()
        deleted_ids: list[str] = []
        for dup in to_delete:
            dup_id = str(dup.id)
            try:
                await scheduler.unschedule_task(dup_id)
            except Exception:
                pass
            await dup.delete()
            deleted_ids.append(dup_id)

        # Reschedule the kept task
        try:
            await scheduler.unschedule_task(str(kept.id))
            await scheduler.schedule_task(kept)
        except Exception:
            pass

        final_summary = (
            f"✅ Done. Merged {len(tasks)} tasks into 1. "
            f"Deleted duplicate task IDs: {', '.join(deleted_ids) or '(none)'}"
        )
        full_transcript = (
            f"**Merged task:** {merged.name}\n\n"
            f"**Description:** {merged.description}\n\n"
            f"**Symbols ({len(merged.symbols)}):** {', '.join(merged.symbols)}\n\n"
            f"**Custom instructions:**\n{merged.custom_instructions}\n\n"
            f"**Flags:** trading={merged.trading_enabled}, "
            f"monitoring={merged.monitoring_enabled}, "
            f"subagents={merged.use_subagents}, "
            f"risk={merged.risk_level}, mode={merged.agent_mode}\n\n"
            f"{final_summary}"
        )

        # Persist the full transcript as a single assistant message so the
        # session has durable content after reload. Capture the doc id so
        # the WS payload carries the same id — see `.claude/rules/code-guide.md`
        # "Chat-Session Features" leg "Message id on wire".
        final_doc = await persist_session_message_doc(
            session,
            role="assistant",
            content=full_transcript,
            timestamp=datetime.now(UTC),
        )
        # Final message event clears the loading spinner and triggers
        # tasks-list refetch on the client.
        await emit_final_message(full_transcript, message_id=str(final_doc.id))

        # Windows toast — same path the task scheduler uses on task completion.
        try:
            from app.db.models.notification import NotificationType
            from app.services.notification_service import NotificationService

            await NotificationService().create_notification(
                user_id=user_id,
                title="Task Merge Complete",
                body=f"Merged {len(tasks)} duplicate task(s) into '{merged.name}'.",
                notification_type=NotificationType.TASK_COMPLETED,
                session_id=session.id,
            )
        except Exception:
            logger.debug("Merge completion notification failed", exc_info=True)
    except Exception as exc:
        err = f"❌ Merge failed: {exc}"
        err_doc = await persist_session_message_doc(
            session,
            role="assistant",
            content=err,
            timestamp=datetime.now(UTC),
        )
        try:
            await emit_final_message(err, message_id=str(err_doc.id))
        except Exception:
            pass
        try:
            from app.db.models.notification import NotificationType
            from app.services.notification_service import NotificationService

            await NotificationService().create_notification(
                user_id=user_id,
                title="Task Merge Failed",
                body=str(exc)[:200],
                notification_type=NotificationType.TASK_FAILED,
                session_id=session.id,
            )
        except Exception:
            logger.debug("Merge failure notification failed", exc_info=True)
    finally:
        session.is_active = False
        session.ended_at = datetime.now(UTC)
        session.last_message_at = session.ended_at
        await session.save()


@router.post("/merge-duplicates", response_model=MergeDuplicatesResponse)
async def merge_duplicate_tasks(
    current_user: User = Depends(get_current_active_user),
) -> MergeDuplicatesResponse:
    """Kick off an AI-powered merge of all the user's tasks.

    Returns immediately with a ``session_id`` so the client can navigate to
    the chat session and watch the merge stream in real time via the existing
    ``agent:chat:*`` WebSocket channel.
    """
    import asyncio
    from datetime import UTC

    from app.db.models.agent_session import AgentSession, persist_session_message

    tasks = (
        await AgentTask.find(AgentTask.user_id == current_user.id)
        .sort(+AgentTask.created_at)
        .to_list()
    )

    if len(tasks) <= 1:
        return MergeDuplicatesResponse(merged=False, message="No duplicates to merge.")

    now = datetime.now(UTC)
    session = AgentSession(
        user_id=current_user.id,
        title="Task cleanup: merge duplicate tasks",
        symbols_discussed=sorted({s for t in tasks for s in t.symbols}),
        is_active=True,
        started_at=now,
        last_message_at=now,
    )
    await session.insert()

    input_summary = "\n".join(
        f"- Task {i + 1} ({t.id}): {t.name} — symbols={list(t.symbols)} "
        f"runs={t.run_count} last_run={t.last_run_at}"
        for i, t in enumerate(tasks)
    )
    await persist_session_message(
        session,
        role="user",
        content=(
            f"Merging {len(tasks)} duplicate tasks into one consolidated task.\n\n{input_summary}"
        ),
        timestamp=now,
    )

    # Fire the merge as a background task so the HTTP response returns fast
    # and the frontend can navigate to the session immediately.
    task_ids = [t.id for t in tasks]
    asyncio.create_task(  # noqa: RUF006
        _run_merge_in_background(current_user.id, task_ids, session.id)
    )

    return MergeDuplicatesResponse(
        merged=True,
        session_id=str(session.id),
        message=f"Merge started for {len(tasks)} tasks. Opening chat session…",
    )


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status: TaskStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List user's tasks with filtering and pagination."""
    query = AgentTask.find(AgentTask.user_id == current_user.id)

    if status:
        query = query.find(AgentTask.status == status)

    total = await query.count()

    tasks = (
        await query.sort(-AgentTask.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "tasks": [task_to_response(t) for t in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/emergency-stop")
async def emergency_stop(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Pause all active trading tasks (emergency stop)."""
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    paused_count = await scheduler.pause_all_tasks()
    return {"paused_count": paused_count}


@router.post("/run-now-local", response_model=dict)
async def run_task_now_local(request: Request) -> dict:
    """Run the active task. Localhost-only, no auth (for tray menu)."""
    client_host = request.client.host if request.client else None
    if client_host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Localhost only")
    task = await AgentTask.find_one(AgentTask.status == TaskStatus.ACTIVE)
    if not task:
        raise HTTPException(status_code=404, detail="No active task")
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.run_task_now(str(task.id))
    return {"message": f"Task '{task.name}' started", "is_running": True}


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> TaskResponse:
    """Get a specific task by ID."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_to_response(task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_active_user),
) -> TaskResponse:
    """Update a task."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update fields
    update_data = task_data.model_dump(exclude_unset=True)

    # Convert schedule schemas to model instances
    if "schedules" in update_data:
        update_data["schedules"] = [TaskSchedule(**s) for s in update_data["schedules"]]
    if "monitoring_conditions" in update_data:
        update_data["monitoring_conditions"] = [
            MonitoringCondition(**c) for c in update_data["monitoring_conditions"]
        ]

    # Validate monitoring requires conditions
    monitoring_on = update_data.get("monitoring_enabled", task.monitoring_enabled)
    conditions = update_data.get("monitoring_conditions", task.monitoring_conditions)
    if monitoring_on and not conditions:
        raise HTTPException(
            status_code=400,
            detail="Monitoring requires at least one monitoring condition",
        )

    # Validate each schedule
    schedules_data = update_data.get("schedules", task.schedules)
    for schedule in schedules_data:
        freq = (
            schedule.frequency if isinstance(schedule, TaskSchedule) else schedule.get("frequency")
        )
        cron = (
            schedule.cron_expression
            if isinstance(schedule, TaskSchedule)
            else schedule.get("cron_expression")
        )
        if freq == TaskFrequency.CUSTOM and not cron:
            raise HTTPException(
                status_code=400,
                detail="cron_expression is required for custom frequency",
            )

    for field, value in update_data.items():
        setattr(task, field, value)

    task.update_timestamp()
    await task.save()

    # Reschedule if schedules changed
    if "schedules" in update_data:
        from app.agent.task_scheduler import get_scheduler

        scheduler = get_scheduler()
        await scheduler.schedule_task(task)

    return task_to_response(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Delete a task."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Unschedule first
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.unschedule_task(task_id)

    # Delete from database
    await task.delete()

    return {"message": "Task deleted successfully"}


@router.post("/{task_id}/pause", response_model=TaskResponse)
async def pause_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> TaskResponse:
    """Pause a running task."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != TaskStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Task is not active")

    task.pause()
    await task.save()

    # Unschedule from scheduler
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.unschedule_task(task_id)

    return task_to_response(task)


@router.post("/{task_id}/resume", response_model=TaskResponse)
async def resume_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> TaskResponse:
    """Resume a paused task."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != TaskStatus.PAUSED:
        raise HTTPException(status_code=400, detail="Task is not paused")

    task.resume()
    await task.save()

    # Reschedule
    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.schedule_task(task)

    return task_to_response(task)


@router.post("/{task_id}/run-now", response_model=dict)
async def run_task_now(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Execute a task immediately."""
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    from app.agent.task_scheduler import get_scheduler

    scheduler = get_scheduler()
    await scheduler.run_task_now(task_id)

    return {"message": "Task execution started", "is_running": True}


@router.get("/{task_id}/history", response_model=TaskExecutionListResponse)
async def get_task_history(
    task_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get execution history for a task."""
    # Verify task ownership
    task = await AgentTask.find_one(
        AgentTask.id == PydanticObjectId(task_id),
        AgentTask.user_id == current_user.id,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Get decisions for this task
    query = AgentDecision.find(AgentDecision.task_id == PydanticObjectId(task_id))

    total = await query.count()

    decisions = (
        await query.sort(-AgentDecision.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    executions = [
        TaskExecutionResponse(
            id=str(d.id),
            task_id=str(d.task_id),
            session_id=str(d.session_id) if d.session_id else None,
            decision_type=d.decision_type.value,
            symbol=d.symbol,
            action=d.action.value if d.action else None,
            confidence=d.confidence,
            summary=d.summary,
            reasoning=d.reasoning,
            key_factors=d.key_factors,
            status=d.status.value,
            created_at=d.created_at,
        )
        for d in decisions
    ]

    return {
        "executions": executions,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
