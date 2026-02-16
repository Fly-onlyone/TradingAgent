"""Agent decision model for persisting AI trading decisions."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class DecisionType(str, Enum):
    """Type of agent decision."""

    ANALYSIS = "analysis"  # Market analysis
    RECOMMENDATION = "recommendation"  # Trade recommendation
    TRADE_EXECUTION = "trade_execution"  # Actual trade executed
    RISK_ALERT = "risk_alert"  # Risk warning
    NEWS_INSIGHT = "news_insight"  # News-based insight
    MONITORING_ALERT = "monitoring_alert"  # Price/condition alert


class DecisionAction(str, Enum):
    """Recommended or executed action."""

    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    WAIT = "wait"
    CLOSE = "close"


class DecisionStatus(str, Enum):
    """Status of the decision."""

    PENDING = "pending"  # Awaiting user confirmation (ASK mode)
    CONFIRMED = "confirmed"  # User confirmed
    REJECTED = "rejected"  # User rejected
    EXECUTED = "executed"  # Trade was executed
    EXPIRED = "expired"  # Confirmation timeout


class ExecutionStatus(str, Enum):
    """Execution lifecycle status for a trade decision."""

    QUEUED = "queued"
    SUBMITTED = "submitted"
    FILLED = "filled"
    FAILED = "failed"


class ToolUsage:
    """Record of a tool used during decision making."""

    name: str
    arguments: dict = Field(default_factory=dict)
    result_summary: Optional[str] = None
    execution_time_ms: Optional[int] = None


class MarketContext:
    """Snapshot of market conditions at decision time."""

    price: Optional[float] = None
    price_change_24h: Optional[float] = None
    volume_24h: Optional[float] = None
    rsi: Optional[float] = None
    macd_signal: Optional[str] = None  # bullish, bearish, neutral
    trend: Optional[str] = None  # up, down, sideways
    support_levels: list[float] = Field(default_factory=list)
    resistance_levels: list[float] = Field(default_factory=list)
    news_sentiment: Optional[float] = None  # -1 to 1


class AgentDecision(Document):
    """Agent decision document - stores all AI trading decisions."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    session_id: Optional[PydanticObjectId] = None
    task_id: Optional[PydanticObjectId] = None

    # Decision classification (indexes defined in Settings)
    decision_type: DecisionType
    symbol: Optional[str] = None

    # Decision details
    action: Optional[DecisionAction] = None
    confidence: Optional[float] = None  # 0-100
    status: DecisionStatus = DecisionStatus.EXECUTED

    # Content
    summary: str  # Short summary (1-2 sentences)
    reasoning: str  # Full AI reasoning
    key_factors: list[str] = Field(default_factory=list)  # Main decision factors

    # Trade specifics (if applicable)
    suggested_entry: Optional[float] = None
    suggested_stop_loss: Optional[float] = None
    suggested_take_profit: Optional[float] = None
    suggested_position_size: Optional[float] = None
    risk_reward_ratio: Optional[float] = None

    # Execution tracking
    order_id: Optional[PydanticObjectId] = None  # If trade was executed
    execution_price: Optional[float] = None
    execution_status: ExecutionStatus = ExecutionStatus.QUEUED
    execution_error_code: Optional[str] = None
    execution_error_message: Optional[str] = None

    # Tool and context tracking
    tools_used: list[dict] = Field(default_factory=list)  # List of tool invocations
    market_context: Optional[dict] = None  # Market snapshot at decision time
    model_used: str = "claude-sonnet-4-20250514"

    # User feedback (for learning)
    user_feedback: Optional[str] = None  # thumbs_up, thumbs_down, neutral
    feedback_comment: Optional[str] = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confirmed_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None  # For ASK mode confirmations

    class Settings:
        name = "agent_decisions"
        use_state_management = True
        indexes = [
            "session_id",
            "task_id",
            "decision_type",
            "symbol",
            "created_at",
        ]

    def confirm(self) -> None:
        """User confirmed the decision."""
        self.status = DecisionStatus.CONFIRMED
        self.confirmed_at = datetime.now(timezone.utc)

    def reject(self) -> None:
        """User rejected the decision."""
        self.status = DecisionStatus.REJECTED

    def mark_executed(self, order_id: PydanticObjectId, price: float | None) -> None:
        """Mark decision as executed with order details."""
        self.status = DecisionStatus.EXECUTED
        self.order_id = order_id
        self.execution_price = price
        self.execution_status = ExecutionStatus.FILLED
        self.execution_error_code = None
        self.execution_error_message = None
        self.executed_at = datetime.now(timezone.utc)

    def mark_execution_failed(
        self, error_message: str, error_code: str = "execution_failed"
    ) -> None:
        """Mark decision execution failure details."""
        self.execution_status = ExecutionStatus.FAILED
        self.execution_error_code = error_code
        self.execution_error_message = error_message

    def expire(self) -> None:
        """Mark decision as expired (confirmation timeout)."""
        self.status = DecisionStatus.EXPIRED
