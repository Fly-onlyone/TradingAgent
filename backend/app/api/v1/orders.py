"""Order management endpoints using Beanie ODM."""

import logging
from datetime import datetime
from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.agent.subagents.order_executor import OrderExecutor
from app.api.v1.auth import get_current_active_user
from app.db.models.order import Order, OrderSide, OrderStatus, OrderType
from app.db.models.user import User
from app.exchange.okx_client import OKXClient
from app.services.pnl_calculator import (
    TradePnL,
    TradesBySymbol,
    TradeSummary,
    export_trades,
    get_trades,
    get_trades_by_symbol,
    get_trades_summary,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class OrderCreate(BaseModel):
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: float | None = None
    stop_price: float | None = None
    stop_loss_price: float | None = None
    take_profit_price: float | None = None
    strategy_id: str | None = None


class OrderResponse(BaseModel):
    id: str
    exchange_order_id: str | None
    client_order_id: str | None
    symbol: str
    side: str
    order_type: str
    status: str
    quantity: float
    filled_quantity: float
    price: float | None
    avg_fill_price: float | None
    stop_price: float | None
    stop_loss_price: float | None
    take_profit_price: float | None
    # P&L fields
    entry_price: float | None
    exit_price: float | None
    realized_pnl: float | None
    realized_pnl_percent: float | None
    fees_paid: float | None
    net_pnl: float | None
    trade_status: str | None
    # Metadata
    agent_reasoning: dict | None
    created_at: datetime
    updated_at: datetime
    filled_at: datetime | None
    closed_at: datetime | None

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    """Paginated order list response."""

    orders: list[OrderResponse]
    total: int
    page: int
    page_size: int


class TradeListResponse(BaseModel):
    """Paginated trade list response with P&L."""

    trades: list[TradePnL]
    total: int
    page: int
    page_size: int


class TradesBySymbolResponse(BaseModel):
    """Response with trades grouped by symbol."""

    symbols: list[TradesBySymbol]


class OKXOrderResponse(BaseModel):
    """Normalized OKX order response for frontend consumption."""

    order_id: str
    client_order_id: str | None = None
    symbol: str
    side: str
    order_type: str
    status: str
    raw_status: str
    quantity: float
    filled_quantity: float
    price: float | None = None
    avg_fill_price: float | None = None
    created_at_ms: int
    updated_at_ms: int


class OKXOrderListResponse(BaseModel):
    """List response for normalized OKX orders."""

    orders: list[OKXOrderResponse]
    count: int
    error: str | None = None


class OKXCancelOrderRequest(BaseModel):
    """Request payload for OKX order cancellation."""

    symbol: str
    order_id: str


class OKXCancelOrderResponse(BaseModel):
    """Response payload for OKX order cancellation."""

    success: bool
    message: str
    error: str | None = None


def _to_float(value: object, default: float = 0.0) -> float:
    """Convert OKX numeric-like values to float while tolerating blanks."""
    if value is None:
        return default
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return default
        value = cleaned
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_optional_float(value: object) -> float | None:
    """Convert OKX numeric-like values to float or None when blank."""
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        value = cleaned
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_timestamp_ms(value: object) -> int:
    """Convert OKX timestamps to milliseconds since epoch."""
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return int(datetime.now().timestamp() * 1000)
        try:
            return int(float(cleaned))
        except ValueError:
            return int(datetime.now().timestamp() * 1000)
    return int(datetime.now().timestamp() * 1000)


def _normalize_okx_state(raw_state: object) -> str:
    """Normalize OKX order state values to frontend-friendly statuses."""
    state = str(raw_state or "").strip().lower()
    state_map = {
        "live": "open",
        "partially_filled": "partially_filled",
        "filled": "filled",
        "canceled": "cancelled",
    }
    return state_map.get(state, "pending")


def _normalize_okx_order(order_data: dict[str, Any]) -> OKXOrderResponse:
    """Map raw OKX order payload to normalized API response."""
    created_at_ms = _to_timestamp_ms(order_data.get("cTime"))
    updated_at_ms = _to_timestamp_ms(order_data.get("uTime")) or created_at_ms
    raw_status = str(order_data.get("state", "")).strip().lower()
    return OKXOrderResponse(
        order_id=str(order_data.get("ordId", "")),
        client_order_id=(
            str(order_data.get("clOrdId")).strip()
            if order_data.get("clOrdId")
            else None
        ),
        symbol=str(order_data.get("instId", "")),
        side=str(order_data.get("side", "")),
        order_type=str(order_data.get("ordType", "")),
        status=_normalize_okx_state(raw_status),
        raw_status=raw_status,
        quantity=_to_float(order_data.get("sz")),
        filled_quantity=_to_float(order_data.get("accFillSz")),
        price=_to_optional_float(order_data.get("px")),
        avg_fill_price=_to_optional_float(order_data.get("avgPx")),
        created_at_ms=created_at_ms,
        updated_at_ms=updated_at_ms,
    )


def order_to_response(order: Order) -> OrderResponse:
    return OrderResponse(
        id=str(order.id),
        exchange_order_id=order.exchange_order_id,
        client_order_id=order.client_order_id,
        symbol=order.symbol,
        side=order.side.value,
        order_type=order.order_type.value,
        status=order.status.value,
        quantity=order.quantity,
        filled_quantity=order.filled_quantity,
        price=order.price,
        avg_fill_price=order.avg_fill_price,
        stop_price=order.stop_price,
        stop_loss_price=order.stop_loss_price,
        take_profit_price=order.take_profit_price,
        entry_price=order.entry_price,
        exit_price=order.exit_price,
        realized_pnl=order.realized_pnl,
        realized_pnl_percent=order.realized_pnl_percent,
        fees_paid=order.fees_paid,
        net_pnl=order.net_pnl,
        trade_status=order.trade_status.value if order.trade_status else None,
        agent_reasoning=order.agent_reasoning,
        created_at=order.created_at,
        updated_at=order.updated_at,
        filled_at=order.filled_at,
        closed_at=order.closed_at,
    )


@router.post("", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_active_user),
) -> OrderResponse:
    """Create and submit a new trading order to the exchange."""
    if order_data.order_type not in {OrderType.MARKET, OrderType.LIMIT}:
        raise HTTPException(
            status_code=400,
            detail="Only market and limit orders are supported for live submission",
        )

    executor = OrderExecutor(user_id=current_user.id)
    result = await executor.execute_trade(
        symbol=order_data.symbol,
        side=order_data.side.value,
        quantity=order_data.quantity,
        order_type=str(order_data.order_type.value),
        price=order_data.price,
        stop_loss=order_data.stop_loss_price,
        take_profit=order_data.take_profit_price,
        reasoning={"source": "orders_api"},
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Order failed"))

    if not result.get("order_id"):
        raise HTTPException(
            status_code=500,
            detail="Order placed but internal order record is missing",
        )

    order = await Order.find_one(
        Order.id == PydanticObjectId(result["order_id"]),
        Order.user_id == current_user.id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order record not found")

    if order_data.strategy_id:
        try:
            order.strategy_id = PydanticObjectId(order_data.strategy_id)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid strategy_id") from exc
        order.update_timestamp()
        await order.save()

    return order_to_response(order)


@router.get("", response_model=OrderListResponse)
async def list_orders(
    status: OrderStatus | None = None,
    symbol: str | None = None,
    side: OrderSide | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List user's orders with filtering and pagination."""
    # Build query
    query = Order.find(Order.user_id == current_user.id)

    if status:
        query = query.find(Order.status == status)
    if symbol:
        query = query.find(Order.symbol == symbol)
    if side:
        query = query.find(Order.side == side)

    # Count total
    total = await query.count()

    # Get paginated results
    orders = (
        await query.sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "orders": [order_to_response(o) for o in orders],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ============================================================
# Trade History & P&L Endpoints
# (Must be defined before /{order_id} to avoid route conflict)
# ============================================================


@router.get("/trades", response_model=TradeListResponse)
async def list_trades(
    symbol: str | None = None,
    side: str | None = None,
    status: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """
    Get completed trades with P&L information.

    Filters:
    - symbol: Filter by trading pair (e.g., BTC-USDT)
    - side: Filter by order side (buy/sell)
    - status: Filter by trade status (open/closed)
    - start_date: Filter trades from this date
    - end_date: Filter trades until this date
    """
    trades, total = await get_trades(
        user_id=current_user.id,
        symbol=symbol,
        side=side,
        status=status,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )

    return {
        "trades": trades,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/trades/summary", response_model=TradeSummary)
async def get_trade_summary(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
) -> TradeSummary:
    """
    Get aggregated trade statistics.

    Returns:
    - Total P&L and percentage
    - Win rate and trade counts
    - Average win/loss
    - Best/worst trade
    - Profit factor
    """
    return await get_trades_summary(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/trades/by-symbol", response_model=TradesBySymbolResponse)
async def get_trades_grouped_by_symbol(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """
    Get trades grouped by symbol with P&L totals.

    Returns trades organized by trading pair with aggregated
    statistics for each symbol.
    """
    symbols = await get_trades_by_symbol(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )

    return {"symbols": symbols}


@router.get("/trades/export")
async def export_trades_data(
    format: str = Query("json", pattern="^(json|csv)$"),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """
    Export trades to CSV or JSON format.

    Args:
        format: Export format - "json" or "csv"
        start_date: Filter trades from this date
        end_date: Filter trades until this date

    Returns:
        File download response in requested format
    """
    content = await export_trades(
        user_id=current_user.id,
        format=format,
        start_date=start_date,
        end_date=end_date,
    )

    if format == "csv":
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trades_export.csv"},
        )
    else:
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=trades_export.json"},
        )


# ============================================================
# OKX Orders Endpoints
# ============================================================


@router.get("/okx/open", response_model=OKXOrderListResponse)
async def list_okx_open_orders(
    symbol: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> OKXOrderListResponse:
    """Get live open orders directly from OKX."""
    _ = current_user
    client = await OKXClient.create()
    try:
        result = await client.get_open_orders(
            inst_type="SPOT",
            inst_id=symbol.upper() if symbol else None,
        )
        if result.get("code") == "0":
            orders = [
                _normalize_okx_order(item)
                for item in (result.get("data", []) or [])
                if isinstance(item, dict)
            ][:limit]
            return OKXOrderListResponse(orders=orders, count=len(orders))
        message = str(result.get("msg", "Unknown error from OKX"))
        return OKXOrderListResponse(
            orders=[],
            count=0,
            error=f"OKX API error: {message}",
        )
    except Exception as exc:
        logger.warning("Failed to fetch open orders from OKX: %s", exc)
        return OKXOrderListResponse(
            orders=[],
            count=0,
            error=f"Unable to fetch open OKX orders: {exc}",
        )


@router.get("/okx/history", response_model=OKXOrderListResponse)
async def list_okx_order_history(
    symbol: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> OKXOrderListResponse:
    """Get recent order history directly from OKX."""
    _ = current_user
    client = await OKXClient.create()
    try:
        result = await client.get_order_history(
            inst_type="SPOT",
            inst_id=symbol.upper() if symbol else None,
            limit=limit,
        )
        if result.get("code") == "0":
            orders = [
                _normalize_okx_order(item)
                for item in (result.get("data", []) or [])
                if isinstance(item, dict)
            ]
            return OKXOrderListResponse(orders=orders, count=len(orders))
        message = str(result.get("msg", "Unknown error from OKX"))
        return OKXOrderListResponse(
            orders=[],
            count=0,
            error=f"OKX API error: {message}",
        )
    except Exception as exc:
        logger.warning("Failed to fetch order history from OKX: %s", exc)
        return OKXOrderListResponse(
            orders=[],
            count=0,
            error=f"Unable to fetch OKX order history: {exc}",
        )


@router.post("/okx/cancel", response_model=OKXCancelOrderResponse)
async def cancel_okx_order(
    payload: OKXCancelOrderRequest,
    current_user: User = Depends(get_current_active_user),
) -> OKXCancelOrderResponse:
    """Cancel an OKX order by symbol and exchange order id."""
    executor = OrderExecutor(user_id=current_user.id)
    result = await executor.cancel_order(
        symbol=payload.symbol,
        order_id=payload.order_id,
    )
    if result.get("success"):
        return OKXCancelOrderResponse(
            success=True,
            message=str(result.get("message", "Order cancelled successfully")),
        )
    return OKXCancelOrderResponse(
        success=False,
        message="Order cancellation failed",
        error=str(result.get("error", "Unknown error")),
    )


# ============================================================
# Single Order Endpoints (dynamic /{order_id} must be last)
# ============================================================


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(get_current_active_user),
) -> OrderResponse:
    """Get a specific order by ID."""
    order = await Order.find_one(
        Order.id == PydanticObjectId(order_id),
        Order.user_id == current_user.id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_to_response(order)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_active_user),
) -> OrderResponse:
    """Cancel an open order on the exchange and persist local status."""
    order = await Order.find_one(
        Order.id == PydanticObjectId(order_id),
        Order.user_id == current_user.id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in [OrderStatus.PENDING, OrderStatus.OPEN]:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")

    if not order.exchange_order_id:
        order.status = OrderStatus.CANCELLED
        order.update_timestamp()
        await order.save()
        return order_to_response(order)

    executor = OrderExecutor(user_id=current_user.id)
    cancel_result = await executor.cancel_order(
        symbol=order.symbol,
        order_id=order.exchange_order_id,
    )
    if not cancel_result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=cancel_result.get("error", "Order cancellation failed"),
        )

    refreshed = await Order.find_one(
        Order.id == PydanticObjectId(order_id),
        Order.user_id == current_user.id,
    )
    if not refreshed:
        raise HTTPException(
            status_code=404, detail="Order not found after cancellation"
        )

    return order_to_response(refreshed)
