"""Market data models for time-series storage (MongoDB/Beanie).

Note: For high-frequency market data, MongoDB time-series collections are used.
These are created in init_db with specific settings for efficient time-series queries.
"""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field


class MarketData(Document):
    """OHLCV market data - stored in MongoDB time-series collection."""

    symbol: Indexed(str)  # type: ignore[valid-type]
    timeframe: Indexed(str)  # type: ignore[valid-type]  # 1m, 5m, 15m, 1H, 4H, 1D, etc.

    # OHLCV data
    timestamp: Indexed(datetime)  # type: ignore[valid-type]
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: Optional[float] = None

    # Additional metrics
    trade_count: Optional[int] = None
    taker_buy_volume: Optional[float] = None
    taker_sell_volume: Optional[float] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "market_data"
        # Note: Time-series collection settings are applied during init_db
        # This enables efficient time-based queries and automatic bucketing
        timeseries = {
            "time_field": "timestamp",
            "meta_field": "symbol",
            "granularity": "minutes",
        }


class Trade(Document):
    """Individual trades from exchange."""

    symbol: Indexed(str)  # type: ignore[valid-type]

    # Trade data
    timestamp: Indexed(datetime)  # type: ignore[valid-type]
    trade_id: Indexed(str)  # type: ignore[valid-type]  # Exchange trade ID
    price: float
    quantity: float
    side: str  # 'buy' or 'sell'

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "trades"
        timeseries = {
            "time_field": "timestamp",
            "meta_field": "symbol",
            "granularity": "seconds",
        }
