"""Agent task model for scheduled trading operations."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
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


class TaskType(str, Enum):
    """Type of task to execute."""

    ANALYSIS = "analysis"  # Analysis only, no trading
    TRADING = "trading"  # Analysis + trading execution
    MONITORING = "monitoring"  # Price/condition monitoring


class AgentTask(Document):
    """Scheduled agent task document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Task identification
    name: str
    description: Optional[str] = None
    task_type: TaskType = TaskType.ANALYSIS

    # Schedule configuration
    frequency: TaskFrequency
    cron_expression: Optional[str] = None  # For custom frequency
    scheduled_time: Optional[str] = None  # HH:MM format for daily/weekly
    day_of_week: Optional[int] = None  # 0-6 for weekly (Monday=0)
    timezone: str = "UTC"

    # Next/last execution tracking
    next_run_at: Optional[Indexed(datetime)] = None  # type: ignore[valid-type]
    last_run_at: Optional[datetime] = None

    # Trading parameters
    symbols: list[str] = Field(default_factory=list)  # Trading pairs to analyze
    risk_level: RiskLevel = RiskLevel.MODERATE
    agent_mode: AgentMode = AgentMode.ASK
    max_position_size: Optional[float] = None  # Max position in quote currency
    max_daily_trades: Optional[int] = None  # Limit trades per day

    # Custom agent instructions
    custom_instructions: Optional[str] = None  # Additional context for agent

    # Status and execution tracking
    status: TaskStatus = TaskStatus.ACTIVE
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    last_error: Optional[str] = None
    last_decision_id: Optional[PydanticObjectId] = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
                [
                    ("user_id", ASCENDING),
                    ("task_type", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="tasks_user_type_created_desc",
            ),
            IndexModel(
                [("status", ASCENDING), ("next_run_at", ASCENDING)],
                name="tasks_status_next_run",
            ),
        ]

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(timezone.utc)

    def record_execution(self, success: bool, error: Optional[str] = None) -> None:
        """Record task execution result."""
        self.run_count += 1
        self.last_run_at = datetime.now(timezone.utc)
        if success:
            self.success_count += 1
            self.last_error = None
        else:
            self.failure_count += 1
            self.last_error = error
        self.update_timestamp()

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
