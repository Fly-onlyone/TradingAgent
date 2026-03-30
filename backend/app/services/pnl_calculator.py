"""P&L Calculator Service for trade performance tracking."""

from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel

from app.db.models.order import Order, OrderSide, OrderStatus, TradeStatus


class TradePnL(BaseModel):
    """Trade with P&L information."""

    id: str
    symbol: str
    side: str
    entry_price: float
    exit_price: float | None = None
    quantity: float
    realized_pnl: float | None = None
    realized_pnl_percent: float | None = None
    fees_paid: float | None = None
    net_pnl: float | None = None
    entry_time: datetime
    exit_time: datetime | None = None
    status: str  # "open" | "closed"
    related_order_id: str | None = None


class TradeSummary(BaseModel):
    """Aggregated trade statistics."""

    total_pnl: float = 0.0
    total_pnl_percent: float = 0.0
    total_fees: float = 0.0
    net_pnl: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    profit_factor: float = 0.0
    avg_trade_pnl: float = 0.0
    total_volume: float = 0.0


class TradesBySymbol(BaseModel):
    """Trades grouped by symbol."""

    symbol: str
    total_pnl: float = 0.0
    total_pnl_percent: float = 0.0
    net_pnl: float = 0.0
    trade_count: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    trades: list[TradePnL] = []


def order_to_trade_pnl(order: Order) -> TradePnL:
    """Convert an Order document to TradePnL."""
    return TradePnL(
        id=str(order.id),
        symbol=order.symbol,
        side=order.side.value,
        entry_price=order.entry_price or order.avg_fill_price or order.price or 0.0,
        exit_price=order.exit_price,
        quantity=order.filled_quantity or order.quantity,
        realized_pnl=order.realized_pnl,
        realized_pnl_percent=order.realized_pnl_percent,
        fees_paid=order.fees_paid,
        net_pnl=order.net_pnl,
        entry_time=order.filled_at or order.created_at,
        exit_time=order.closed_at,
        status=order.trade_status.value,
        related_order_id=(str(order.related_order_id) if order.related_order_id else None),
    )


async def get_trades(
    user_id: PydanticObjectId,
    symbol: str | None = None,
    side: str | None = None,
    status: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[TradePnL], int]:
    """Get trades with P&L information."""
    # Build query for filled orders (actual trades)
    query = Order.find(
        Order.user_id == user_id,
        Order.status == OrderStatus.FILLED,
        not Order.is_closing_order,  # Only entry orders, not closing orders
    )

    if symbol:
        query = query.find(Order.symbol == symbol)
    if side:
        query = query.find(Order.side == OrderSide(side))
    if status:
        query = query.find(Order.trade_status == TradeStatus(status))
    if start_date:
        query = query.find(Order.created_at >= start_date)
    if end_date:
        query = query.find(Order.created_at <= end_date)

    # Count total
    total = await query.count()

    # Get paginated results
    orders = (
        await query.sort(-Order.created_at).skip((page - 1) * page_size).limit(page_size).to_list()
    )

    trades = [order_to_trade_pnl(order) for order in orders]
    return trades, total


async def get_trades_summary(
    user_id: PydanticObjectId,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> TradeSummary:
    """Calculate aggregated trade statistics."""
    # Get all closed trades for the user
    query = Order.find(
        Order.user_id == user_id,
        Order.status == OrderStatus.FILLED,
        Order.trade_status == TradeStatus.CLOSED,
        not Order.is_closing_order,
    )

    if start_date:
        query = query.find(Order.created_at >= start_date)
    if end_date:
        query = query.find(Order.created_at <= end_date)

    orders = await query.to_list()

    if not orders:
        return TradeSummary()

    # Calculate statistics
    total_pnl = 0.0
    total_fees = 0.0
    total_volume = 0.0
    winning_trades = 0
    losing_trades = 0
    wins = []
    losses = []

    for order in orders:
        pnl = order.realized_pnl or 0.0
        total_pnl += pnl
        total_fees += order.fees_paid or 0.0
        total_volume += (order.entry_price or 0.0) * (order.filled_quantity or 0.0)

        if pnl > 0:
            winning_trades += 1
            wins.append(pnl)
        elif pnl < 0:
            losing_trades += 1
            losses.append(pnl)

    total_trades = len(orders)
    net_pnl = total_pnl - total_fees
    win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0
    best_trade = max(wins) if wins else 0.0
    worst_trade = min(losses) if losses else 0.0
    avg_trade_pnl = total_pnl / total_trades if total_trades > 0 else 0.0

    # Profit factor: sum of wins / abs(sum of losses)
    total_wins = sum(wins) if wins else 0.0
    total_losses = abs(sum(losses)) if losses else 0.0
    profit_factor = total_wins / total_losses if total_losses > 0 else 0.0

    # Calculate total P&L percent based on total volume
    total_pnl_percent = (total_pnl / total_volume * 100) if total_volume > 0 else 0.0

    return TradeSummary(
        total_pnl=total_pnl,
        total_pnl_percent=total_pnl_percent,
        total_fees=total_fees,
        net_pnl=net_pnl,
        total_trades=total_trades,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        best_trade=best_trade,
        worst_trade=worst_trade,
        profit_factor=profit_factor,
        avg_trade_pnl=avg_trade_pnl,
        total_volume=total_volume,
    )


async def get_trades_by_symbol(
    user_id: PydanticObjectId,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[TradesBySymbol]:
    """Get trades grouped by symbol with P&L totals."""
    # Get all filled trades for the user
    query = Order.find(
        Order.user_id == user_id,
        Order.status == OrderStatus.FILLED,
        not Order.is_closing_order,
    )

    if start_date:
        query = query.find(Order.created_at >= start_date)
    if end_date:
        query = query.find(Order.created_at <= end_date)

    orders = await query.sort(-Order.created_at).to_list()

    # Group by symbol
    symbol_groups: dict[str, list[Order]] = {}
    for order in orders:
        if order.symbol not in symbol_groups:
            symbol_groups[order.symbol] = []
        symbol_groups[order.symbol].append(order)

    # Calculate stats per symbol
    result: list[TradesBySymbol] = []

    for symbol, symbol_orders in symbol_groups.items():
        trades = [order_to_trade_pnl(o) for o in symbol_orders]

        # Calculate symbol-level statistics
        total_pnl = sum(o.realized_pnl or 0.0 for o in symbol_orders)
        total_fees = sum(o.fees_paid or 0.0 for o in symbol_orders)
        net_pnl = total_pnl - total_fees
        total_volume = sum(
            (o.entry_price or 0.0) * (o.filled_quantity or 0.0) for o in symbol_orders
        )
        total_pnl_percent = (total_pnl / total_volume * 100) if total_volume > 0 else 0.0

        winning = sum(1 for o in symbol_orders if (o.realized_pnl or 0.0) > 0)
        losing = sum(1 for o in symbol_orders if (o.realized_pnl or 0.0) < 0)
        trade_count = len(symbol_orders)
        win_rate = (winning / trade_count * 100) if trade_count > 0 else 0.0

        result.append(
            TradesBySymbol(
                symbol=symbol,
                total_pnl=total_pnl,
                total_pnl_percent=total_pnl_percent,
                net_pnl=net_pnl,
                trade_count=trade_count,
                winning_trades=winning,
                losing_trades=losing,
                win_rate=win_rate,
                trades=trades,
            )
        )

    result.sort(key=lambda x: x.total_pnl, reverse=True)
    return result


async def close_trade(
    order_id: PydanticObjectId,
    exit_price: float,
    fees: float = 0.0,
) -> Order | None:
    """Close a trade and calculate P&L."""
    order = await Order.get(order_id)
    if not order:
        return None

    # Set entry price if not already set
    if order.entry_price is None:
        order.entry_price = order.avg_fill_price or order.price

    # Calculate P&L
    order.calculate_pnl(exit_price, fees)
    await order.save()
    return order


async def export_trades(
    user_id: PydanticObjectId,
    format: str = "json",
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> str:
    """Export trades to CSV or JSON format."""
    import csv
    import io
    import json

    # Get all trades
    query = Order.find(
        Order.user_id == user_id,
        Order.status == OrderStatus.FILLED,
        not Order.is_closing_order,
    )

    if start_date:
        query = query.find(Order.created_at >= start_date)
    if end_date:
        query = query.find(Order.created_at <= end_date)

    orders = await query.sort(-Order.created_at).to_list()
    trades = [order_to_trade_pnl(order) for order in orders]

    if format == "csv":
        output = io.StringIO()
        if trades:
            writer = csv.DictWriter(output, fieldnames=trades[0].model_dump().keys())
            writer.writeheader()
            for trade in trades:
                row = trade.model_dump()
                # Convert datetime to string
                row["entry_time"] = row["entry_time"].isoformat() if row["entry_time"] else ""
                row["exit_time"] = row["exit_time"].isoformat() if row["exit_time"] else ""
                writer.writerow(row)
        return output.getvalue()
    else:
        # JSON format
        data = [trade.model_dump() for trade in trades]
        for item in data:
            # Convert datetime to ISO string
            if item["entry_time"]:
                item["entry_time"] = item["entry_time"].isoformat()
            if item["exit_time"]:
                item["exit_time"] = item["exit_time"].isoformat()
        return json.dumps(data, indent=2)
