"""Order model for MongoDB."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class OrderSide(str, Enum):
    """Order side enum."""

    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    """Order type enum."""

    MARKET = "market"
    LIMIT = "limit"
    STOP_MARKET = "stop_market"
    STOP_LIMIT = "stop_limit"
    TAKE_PROFIT = "take_profit"
    TAKE_PROFIT_LIMIT = "take_profit_limit"


class OrderStatus(str, Enum):
    """Order status enum."""

    PENDING = "pending"
    OPEN = "open"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"


class Order(Document):
    """Trading order document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Exchange order info
    exchange_order_id: Optional[Indexed(str)] = None  # type: ignore[valid-type]
    client_order_id: Optional[str] = None

    # Order details
    symbol: Indexed(str)  # type: ignore[valid-type]
    side: OrderSide
    order_type: OrderType
    status: OrderStatus = OrderStatus.PENDING

    # Quantities and prices (using float for MongoDB, convert from Decimal as needed)
    quantity: float
    filled_quantity: float = 0.0
    price: Optional[float] = None  # For limit orders
    avg_fill_price: Optional[float] = None
    stop_price: Optional[float] = None

    # Risk management
    stop_loss_price: Optional[float] = None
    take_profit_price: Optional[float] = None

    # Agent info
    agent_reasoning: Optional[dict] = None
    strategy_id: Optional[PydanticObjectId] = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    filled_at: Optional[datetime] = None

    class Settings:
        name = "orders"
        use_state_management = True

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(timezone.utc)
