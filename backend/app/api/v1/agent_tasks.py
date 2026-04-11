"""Agent task management endpoints."""

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
