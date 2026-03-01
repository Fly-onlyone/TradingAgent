"""Trading strategy model for MongoDB."""

from datetime import datetime, timezone, UTC
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class Strategy(Document):
    """Trading strategy document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Strategy info
    name: str
    description: Optional[str] = None
    is_active: bool = False

    # Strategy configuration
    entry_rules: dict = Field(default_factory=dict)
    exit_rules: dict = Field(default_factory=dict)
    risk_params: dict = Field(default_factory=dict)
    symbols: list[str] = Field(default_factory=list)  # Symbols to trade
    timeframes: list[str] = Field(default_factory=list)  # Timeframes to analyze

    # Performance tracking
    backtest_results: Optional[dict] = None
    live_performance: Optional[dict] = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_executed_at: Optional[datetime] = None

    class Settings:
        name = "strategies"
        use_state_management = True

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(UTC)
