"""Knowledge base models for RAG and trade learning (MongoDB/Beanie)."""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class StrategyKnowledge(Document):
    """Knowledge base for trading strategies."""

    name: Indexed(str)  # type: ignore[valid-type]
    description: str

    # Strategy rules
    entry_rules: dict  # Conditions to enter trade
    exit_rules: dict  # Conditions to exit
    risk_params: dict  # Position sizing, stop-loss

    # Performance metrics
    backtest_results: Optional[dict] = None
    win_rate: Optional[float] = None
    avg_return: Optional[float] = None
    max_drawdown: Optional[float] = None
    sharpe_ratio: Optional[float] = None

    # Metadata
    market_conditions: Optional[list[str]] = None  # Best conditions for strategy
    asset_classes: Optional[list[str]] = None  # Suitable assets
    timeframes: Optional[list[str]] = None  # Suitable timeframes

    # Embedding for semantic search (1024-dim BGE-M3 vector stored inline)
    embedding: Optional[list[float]] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "strategy_knowledge"
        use_state_management = True

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(timezone.utc)


class TradeLesson(Document):
    """Lessons learned from past trades."""

    order_id: Optional[PydanticObjectId] = None

    # Trade outcome
    outcome: str  # 'profit', 'loss', 'breakeven'
    profit_pct: float
    profit_amount: Optional[float] = None

    # Lesson content
    lesson_summary: str  # AI-generated insight
    market_context: dict  # Market conditions during trade
    mistakes: Optional[list[str]] = None  # What went wrong
    successes: Optional[list[str]] = None  # What went right
    recommendations: Optional[list[str]] = None  # Future improvements

    # Trade metadata
    symbol: Indexed(str)  # type: ignore[valid-type]
    side: str
    entry_price: float
    exit_price: float
    duration_minutes: Optional[int] = None

    # Embedding for semantic search (1024-dim BGE-M3 vector)
    embedding: Optional[list[float]] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "trade_lessons"
        use_state_management = True


class TradingPattern(Document):
    """Recognized trading patterns from historical data."""

    # Pattern info
    pattern_name: Indexed(str)  # type: ignore[valid-type]
    pattern_type: str  # 'technical', 'sentiment', 'correlation'
    description: str

    # Pattern definition
    conditions: dict  # Pattern conditions

    # Performance metrics
    success_rate: float
    sample_count: int
    avg_return: float
    avg_duration_hours: Optional[int] = None

    # Applicability
    symbols: Optional[list[str]] = None  # Symbols where pattern works
    timeframes: Optional[list[str]] = None  # Best timeframes
    market_conditions: Optional[list[str]] = None  # Best conditions

    # Embedding for semantic search (1024-dim BGE-M3 vector)
    embedding: Optional[list[float]] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_validated: Optional[datetime] = None

    class Settings:
        name = "trading_patterns"
        use_state_management = True


# Note: StrategyEmbedding is no longer needed as embeddings are stored inline
# in StrategyKnowledge document for MongoDB
