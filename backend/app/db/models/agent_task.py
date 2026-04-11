"""Agent task model for scheduled trading operations."""

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field, model_validator
from pymongo import ASCENDING, DESCENDING, IndexModel


def _default_timezone() -> str:
    """Detect system timezone for task scheduling (falls back to UTC)."""
    try:
        from tzlocal import get_localzone

        return str(get_localzone())
    except Exception:
        return "UTC"


class TaskFrequency(str, Enum):
    """Task execution frequency."""

    ONCE = "once"
    INTERVAL = "interval"  # Every N minutes/hours (replaces HOURLY)
    DAILY = "daily"
    WEEKLY = "weekly"
    CUSTOM = "custom"  # Uses cron_expression


class IntervalUnit(str, Enum):
    """Unit for interval/repeat scheduling."""

    MINUTES = "minutes"
    HOURS = "hours"


class TaskStatus(str, Enum):
    """Task status enum."""

    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class RiskLevel(str, Enum):
    """Risk level for position sizing."""

    CONSERVATIVE = "conservative"  # 1-2% risk per trade
    MODERATE = "moderate"  # 2-5% risk per trade
    AGGRESSIVE = "aggressive"  # 5-10% risk per trade


class HoldingTerm(str, Enum):
    """Target holding period for positions."""

    SHORT = "short"  # < 7 days
    MEDIUM = "medium"  # 7-30 days
    LONG = "long"  # > 30 days


class AgentMode(str, Enum):
    """Agent execution mode."""

    AUTO = "auto"  # Execute trades without confirmation
    ASK = "ask"  # Notify user and wait for confirmation


class TaskModificationMode(str, Enum):
    """Controls whether the agent can modify task configuration during execution."""

    DISABLED = "disabled"  # Agent cannot modify task
    AUTO = "auto"  # Apply changes immediately
    ASK = "ask"  # Create pending decision for user approval


AGENT_MODIFIABLE_FIELDS: frozenset[str] = frozenset(
    {
        "symbols",
        "risk_level",
        "holding_term",
        "max_position_size",
        "max_daily_trades",
        "monitoring_conditions",
        "alert_cooldown_minutes",
        "custom_instructions",
        "schedules",
        "use_subagents",
    }
)


class MonitoringConditionType(str, Enum):
    """Type of monitoring condition to evaluate."""

    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    PRICE_CHANGE_PCT = "price_change_pct"
    RSI_ABOVE = "rsi_above"
    RSI_BELOW = "rsi_below"
    VOLUME_SPIKE = "volume_spike"
    CUSTOM = "custom"  # AI-evaluated condition


class MonitoringCondition(BaseModel):
    """A single monitoring condition to evaluate."""

    condition_type: MonitoringConditionType
    threshold: float
    timeframe: str | None = None  # e.g., "1H", "4H", "1D"
    description: str | None = None  # Human-readable or custom AI prompt


class TaskSchedule(BaseModel):
    """A single schedule entry for a task.

    For ``interval`` frequency, ``interval_value`` + ``interval_unit`` define the
    primary cadence (e.g. every 30 minutes).  For ``daily``/``weekly``, the same
    fields are optional and add a repeat *within* the main cycle (must be shorter
    than the cycle period).
    """

    frequency: TaskFrequency
    cron_expression: str | None = None  # For custom frequency
    scheduled_time: str | None = None  # HH:MM format for daily/weekly
    day_of_week: int | None = None  # 0-6 for weekly (Monday=0)
    enabled: bool = True  # Toggle individual schedules on/off

    # Interval / repeat fields
    interval_value: int | None = None  # e.g. 2
    interval_unit: IntervalUnit | None = None  # e.g. "hours"

    @model_validator(mode="after")
    def _validate_interval_fields(self) -> "TaskSchedule":
        has_interval = self.interval_value is not None and self.interval_unit is not None

        if self.frequency == TaskFrequency.INTERVAL:
            if not has_interval:
                raise ValueError("interval frequency requires interval_value and interval_unit")
            if self.interval_value is not None and self.interval_value < 1:
                raise ValueError("interval_value must be >= 1")

        if has_interval and self.interval_value is not None and self.interval_unit is not None:
            total_minutes = (
                self.interval_value
                if self.interval_unit == IntervalUnit.MINUTES
                else self.interval_value * 60
            )
            if self.frequency == TaskFrequency.DAILY and total_minutes >= 24 * 60:
                raise ValueError("repeat interval must be shorter than 24 hours for daily schedule")
            if self.frequency == TaskFrequency.WEEKLY and total_minutes >= 7 * 24 * 60:
                raise ValueError("repeat interval must be shorter than 7 days for weekly schedule")

        if self.frequency in (TaskFrequency.ONCE, TaskFrequency.CUSTOM) and has_interval:
            raise ValueError(f"interval fields not supported for {self.frequency.value} frequency")

        return self


def coerce_task_change_value(field_name: str, value: Any) -> Any:
    """Coerce task updates into the document's expected runtime types."""
    if field_name == "risk_level" and value is not None and not isinstance(value, RiskLevel):
        return RiskLevel(value)

    if field_name == "holding_term" and value is not None and not isinstance(value, HoldingTerm):
        return HoldingTerm(value)

    if field_name == "agent_mode" and value is not None and not isinstance(value, AgentMode):
        return AgentMode(value)

    if (
        field_name == "task_modification_mode"
        and value is not None
        and not isinstance(value, TaskModificationMode)
    ):
        return TaskModificationMode(value)

    if field_name == "schedules":
        if not isinstance(value, list):
            raise ValueError("schedules must be a list")
        return [
            (item if isinstance(item, TaskSchedule) else TaskSchedule.model_validate(item))
            for item in value
        ]

    if field_name == "monitoring_conditions":
        if not isinstance(value, list):
            raise ValueError("monitoring_conditions must be a list")
        return [
            (
                item
                if isinstance(item, MonitoringCondition)
                else MonitoringCondition.model_validate(item)
            )
            for item in value
        ]

    return value


def coerce_task_changes(changes: dict[str, Any]) -> dict[str, Any]:
    """Coerce a patch dict before applying it to an AgentTask instance."""
    return {
        field_name: coerce_task_change_value(field_name, value)
        for field_name, value in changes.items()
    }


class AgentTask(Document):
    """Scheduled agent task document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Task identification
    name: str
    description: str | None = None

    # Capability toggles (analysis is always on)
    trading_enabled: bool = False
    monitoring_enabled: bool = False

    # Schedule configuration — multiple schedules per task
    schedules: list[TaskSchedule] = Field(default_factory=list)
    timezone: str = Field(default_factory=_default_timezone)

    # Next/last execution tracking
    next_run_at: Indexed(datetime) | None = None  # type: ignore[valid-type]
    last_run_at: datetime | None = None

    # Trading parameters
    symbols: list[str] = Field(default_factory=list)  # Trading pairs to analyze
    risk_level: RiskLevel = RiskLevel.MODERATE
    holding_term: HoldingTerm = HoldingTerm.MEDIUM
    agent_mode: AgentMode = AgentMode.ASK
    task_modification_mode: TaskModificationMode = TaskModificationMode.DISABLED
    max_position_size: float | None = None  # Max position in quote currency
    max_daily_trades: int | None = None  # Limit trades per day

    # Subagent configuration
    use_subagents: bool = False  # Run specialist subagents before main analysis

    # Custom agent instructions
    custom_instructions: str | None = None  # Additional context for agent

    # Monitoring configuration
    monitoring_conditions: list[MonitoringCondition] = Field(default_factory=list)
    alert_cooldown_minutes: int = 60  # Minutes between alerts for same task
    last_alert_at: datetime | None = None

    # Retry and failure configuration
    max_retries: int = 2  # Max retries per execution on transient errors
    consecutive_failures: int = 0  # Current consecutive failure streak
    max_consecutive_failures: int = 3  # Auto-pause after this many consecutive failures

    # Status and execution tracking
    status: TaskStatus = TaskStatus.ACTIVE
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    last_error: str | None = None
    last_decision_id: PydanticObjectId | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_fields(cls, data: Any) -> Any:
        """Convert legacy single-schedule / task_type documents to new format."""
        if not isinstance(data, dict):
            return data

        # Migrate task_type → capability toggles
        task_type = data.pop("task_type", None)
        if task_type is not None:
            if "trading_enabled" not in data:
                data["trading_enabled"] = task_type == "trading"
            if "monitoring_enabled" not in data:
                data["monitoring_enabled"] = task_type == "monitoring"

        # Migrate single schedule fields → schedules list
        if "schedules" not in data and "frequency" in data:
            schedule: dict[str, Any] = {"frequency": data.pop("frequency")}
            cron = data.pop("cron_expression", None)
            if cron is not None:
                schedule["cron_expression"] = cron
            stime = data.pop("scheduled_time", None)
            if stime is not None:
                schedule["scheduled_time"] = stime
            dow = data.pop("day_of_week", None)
            if dow is not None:
                schedule["day_of_week"] = dow
            data["schedules"] = [schedule]
        else:
            # Clean up stale fields that might coexist with schedules
            for key in (
                "frequency",
                "cron_expression",
                "scheduled_time",
                "day_of_week",
            ):
                data.pop(key, None)

        # Migrate "hourly" → "interval" with value=1, unit="hours"
        for sched in data.get("schedules", []):
            if isinstance(sched, dict) and sched.get("frequency") == "hourly":
                sched["frequency"] = "interval"
                sched.setdefault("interval_value", 1)
                sched.setdefault("interval_unit", "hours")

        return data

    class Settings:
        name = "agent_tasks"
        use_state_management = True
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                name="tasks_user_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("status", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="tasks_user_status_created_desc",
            ),
            IndexModel(
                [("status", ASCENDING), ("next_run_at", ASCENDING)],
                name="tasks_status_next_run",
            ),
        ]

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(UTC)

    def record_execution(self, success: bool, error: str | None = None) -> None:
        """Record task execution result and track consecutive failures."""
        self.run_count += 1
        self.last_run_at = datetime.now(UTC)
        if success:
            self.success_count += 1
            self.last_error = None
            self.consecutive_failures = 0
        else:
            self.failure_count += 1
            self.last_error = error
            self.consecutive_failures += 1
        self.update_timestamp()

    @property
    def should_auto_pause(self) -> bool:
        """Check if the task should be auto-paused due to consecutive failures."""
        return self.consecutive_failures >= self.max_consecutive_failures

    def pause(self) -> None:
        """Pause the task."""
        self.status = TaskStatus.PAUSED
        self.update_timestamp()

    def resume(self) -> None:
        """Resume the task."""
        self.status = TaskStatus.ACTIVE
        self.update_timestamp()

    def complete(self) -> None:
        """Mark task as completed (for one-time tasks)."""
        self.status = TaskStatus.COMPLETED
        self.update_timestamp()
