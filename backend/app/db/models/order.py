"""Order model for MongoDB."""

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


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


class TradeStatus(str, Enum):
    """Trade status for P&L tracking."""

    OPEN = "open"
    CLOSED = "closed"


class Order(Document):
    """Trading order document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Exchange order info
    exchange_order_id: Indexed(str) | None = None  # type: ignore[valid-type]
    client_order_id: str | None = None
    execution_idempotency_key: Indexed(str) | None = None  # type: ignore[valid-type]

    # Order details
    symbol: Indexed(str)  # type: ignore[valid-type]
    side: OrderSide
    order_type: OrderType
    status: OrderStatus = OrderStatus.PENDING

    # Quantities and prices (using float for MongoDB, convert from Decimal as needed)
    quantity: float
    filled_quantity: float = 0.0
    price: float | None = None  # For limit orders
    avg_fill_price: float | None = None
    stop_price: float | None = None

    # Risk management
    stop_loss_price: float | None = None
    take_profit_price: float | None = None

    # P&L Tracking Fields
    entry_price: float | None = None  # Actual entry execution price
    exit_price: float | None = None  # Exit execution price (for closed trades)
    realized_pnl: float | None = None  # Realized P&L in quote currency (USDT)
    realized_pnl_percent: float | None = None  # Realized P&L as percentage
    fees_paid: float | None = None  # Total fees for this trade
    net_pnl: float | None = None  # Realized P&L minus fees

    # Position Tracking
    related_order_id: PydanticObjectId | None = None  # Links entry/exit orders
    is_closing_order: bool = False  # True if this closes a position
    trade_status: TradeStatus = TradeStatus.OPEN  # Whether trade is open or closed
    closed_at: datetime | None = None  # When position was closed

    # Agent info
    agent_reasoning: dict | None = None
    strategy_id: PydanticObjectId | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    filled_at: datetime | None = None

    class Settings:
        name = "orders"
        use_state_management = True
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                name="orders_user_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("status", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="orders_user_status_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("symbol", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="orders_user_symbol_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("trade_status", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="orders_user_trade_status_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("execution_idempotency_key", ASCENDING),
                ],
                name="orders_user_idempotency_unique",
                unique=True,
                partialFilterExpression={
                    "execution_idempotency_key": {"$type": "string", "$gt": ""}
                },
            ),
        ]

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(UTC)

    def calculate_pnl(self, exit_price: float, fees: float = 0.0) -> None:
        """Calculate P&L when closing a position."""
        if self.entry_price is None:
            self.entry_price = self.avg_fill_price or self.price

        if self.entry_price is None:
            return

        self.exit_price = exit_price
        self.fees_paid = fees

        # Calculate P&L based on position side
        if self.side == OrderSide.BUY:
            # Long position: profit when exit > entry
            self.realized_pnl = (exit_price - self.entry_price) * self.filled_quantity
        else:
            # Short position: profit when entry > exit
            self.realized_pnl = (self.entry_price - exit_price) * self.filled_quantity

        # Calculate percentage P&L
        position_value = self.entry_price * self.filled_quantity
        if position_value > 0:
            self.realized_pnl_percent = (self.realized_pnl / position_value) * 100

        # Net P&L after fees
        self.net_pnl = self.realized_pnl - fees

        # Mark as closed
        self.trade_status = TradeStatus.CLOSED
        self.closed_at = datetime.now(UTC)
        self.update_timestamp()
