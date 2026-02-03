"""Order management endpoints using Beanie ODM."""

from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db.models.user import User
from app.db.models.order import Order, OrderSide, OrderType, OrderStatus
from app.api.v1.auth import get_current_active_user

router = APIRouter()


class OrderCreate(BaseModel):
    """Order creation schema."""

    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None
    stop_price: Optional[float] = None
    stop_loss_price: Optional[float] = None
    take_profit_price: Optional[float] = None
    strategy_id: Optional[str] = None


class OrderResponse(BaseModel):
    """Order response schema."""

    id: str
    exchange_order_id: Optional[str]
    client_order_id: Optional[str]
    symbol: str
    side: str
    order_type: str
    status: str
    quantity: float
    filled_quantity: float
    price: Optional[float]
    avg_fill_price: Optional[float]
    stop_price: Optional[float]
    stop_loss_price: Optional[float]
    take_profit_price: Optional[float]
    agent_reasoning: Optional[dict]
    created_at: datetime
    updated_at: datetime
    filled_at: Optional[datetime]

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    """Paginated order list response."""

    orders: list[OrderResponse]
    total: int
    page: int
    page_size: int


def order_to_response(order: Order) -> OrderResponse:
    """Convert Order document to response schema."""
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
        agent_reasoning=order.agent_reasoning,
        created_at=order.created_at,
        updated_at=order.updated_at,
        filled_at=order.filled_at,
    )


@router.post("", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_active_user),
) -> OrderResponse:
    """Create a new trading order."""
    strategy_id = None
    if order_data.strategy_id:
        strategy_id = PydanticObjectId(order_data.strategy_id)

    order = Order(
        user_id=current_user.id,
        symbol=order_data.symbol,
        side=order_data.side,
        order_type=order_data.order_type,
        quantity=order_data.quantity,
        price=order_data.price,
        stop_price=order_data.stop_price,
        stop_loss_price=order_data.stop_loss_price,
        take_profit_price=order_data.take_profit_price,
        strategy_id=strategy_id,
        status=OrderStatus.PENDING,
    )
    await order.insert()

    # TODO: Submit order to OKX exchange via exchange client
    # This will be implemented in Phase 2

    return order_to_response(order)


@router.get("", response_model=OrderListResponse)
async def list_orders(
    status: Optional[OrderStatus] = None,
    symbol: Optional[str] = None,
    side: Optional[OrderSide] = None,
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
        await query.sort(-Order.created_at)
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
    """Cancel an open order."""
    order = await Order.find_one(
        Order.id == PydanticObjectId(order_id),
        Order.user_id == current_user.id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in [OrderStatus.PENDING, OrderStatus.OPEN]:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")

    # TODO: Cancel order on OKX exchange
    order.status = OrderStatus.CANCELLED
    order.update_timestamp()
    await order.save()

    return order_to_response(order)
