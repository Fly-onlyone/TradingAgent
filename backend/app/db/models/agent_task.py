"""Agent task model for scheduled trading operations."""

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field, model_validator
from pymongo import ASCENDING, DESCENDING, IndexModel


class TaskFrequency(str, Enum):
    """Task execution frequency."""

    ONCE = "once"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    CUSTOM = "custom"  # Uses cron_expression


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


class AgentMode(str, Enum):
    """Agent execution mode."""

    AUTO = "auto"  # Execute trades without confirmation
    ASK = "ask"  # Notify user and wait for confirmation


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
    """A single schedule entry for a task."""

    frequency: TaskFrequency
    cron_expression: str | None = None  # For custom frequency
    scheduled_time: str | None = None  # HH:MM format for daily/weekly
    day_of_week: int | None = None  # 0-6 for weekly (Monday=0)
    enabled: bool = True  # Toggle individual schedules on/off


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
    timezone: str = "UTC"

    # Next/last execution tracking
    next_run_at: Indexed(datetime) | None = None  # type: ignore[valid-type]
    last_run_at: datetime | None = None

    # Trading parameters
    symbols: list[str] = Field(default_factory=list)  # Trading pairs to analyze
    risk_level: RiskLevel = RiskLevel.MODERATE
    agent_mode: AgentMode = AgentMode.ASK
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
