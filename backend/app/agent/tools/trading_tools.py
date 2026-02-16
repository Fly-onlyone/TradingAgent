"""Trading execution tools for the trading agent."""

from decimal import Decimal
from typing import Any, Optional

from app.exchange.okx_client import OKXClient
from app.config import get_settings

settings = get_settings()


async def get_account_balance() -> dict[str, Any]:
    """Get current account balance.

    Returns:
        Account balance information including available funds
    """
    client = await OKXClient.create()
    result = await client.get_account_balance()

    if result.get("code") != "0" or not result.get("data"):
        return {"error": "Failed to get account balance"}

    data = result["data"][0]
    details = data.get("details", [])

    balances = {}
    total_equity = float(data.get("totalEq", 0))

    for detail in details:
        currency = detail.get("ccy", "")
        if currency:
            balances[currency] = {
                "available": float(detail.get("availBal", 0)),
                "frozen": float(detail.get("frozenBal", 0)),
                "equity": float(detail.get("eq", 0)),
            }

    return {
        "total_equity_usd": total_equity,
        "balances": balances,
    }


async def get_open_orders(symbol: Optional[str] = None) -> dict[str, Any]:
    """Get list of open orders.

    Args:
        symbol: Filter by trading symbol (optional)

    Returns:
        List of open orders
    """
    client = await OKXClient.create()
    result = await client.get_open_orders(inst_type="SPOT", inst_id=symbol)

    if result.get("code") != "0":
        return {"error": "Failed to get open orders"}

    orders = []
    for order_data in result.get("data", []):
        orders.append(
            {
                "order_id": order_data.get("ordId"),
                "client_order_id": order_data.get("clOrdId"),
                "symbol": order_data.get("instId"),
                "side": order_data.get("side"),
                "order_type": order_data.get("ordType"),
                "price": (
                    float(order_data.get("px", 0)) if order_data.get("px") else None
                ),
                "quantity": float(order_data.get("sz", 0)),
                "filled_quantity": float(order_data.get("accFillSz", 0)),
                "status": order_data.get("state"),
                "created_at": order_data.get("cTime"),
            }
        )

    return {
        "orders": orders,
        "count": len(orders),
    }


async def place_order(
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    price: Optional[float] = None,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
) -> dict[str, Any]:
    """Place a trading order.

    Args:
        symbol: Trading pair (e.g., BTC-USDT)
        side: 'buy' or 'sell'
        order_type: 'market' or 'limit'
        quantity: Order quantity
        price: Limit price (required for limit orders)
        stop_loss: Stop loss price (optional)
        take_profit: Take profit price (optional)

    Returns:
        Order placement result
    """
    # Validate inputs
    if side not in ["buy", "sell"]:
        return {"error": "Side must be 'buy' or 'sell'"}

    if order_type not in ["market", "limit"]:
        return {"error": "Order type must be 'market' or 'limit'"}

    if order_type == "limit" and price is None:
        return {"error": "Price is required for limit orders"}

    if quantity <= 0:
        return {"error": "Quantity must be positive"}

    # Risk check - get account balance
    balance_result = await get_account_balance()
    if "error" in balance_result:
        return {"error": "Could not verify account balance for risk check"}

    total_equity = balance_result.get("total_equity_usd", 0)

    # Get current price for risk calculation
    client = await OKXClient.create()
    ticker_result = await client.get_ticker(symbol)

    if ticker_result.get("code") != "0" or not ticker_result.get("data"):
        return {"error": "Could not get current price for risk check"}

    current_price = float(ticker_result["data"][0].get("last", 0))

    # Calculate order value
    order_value = quantity * (price if price else current_price)

    # Check position size limit
    max_position_value = total_equity * (settings.max_position_size_pct / 100)
    if order_value > max_position_value:
        return {
            "error": f"Order value (${order_value:.2f}) exceeds max position size "
            f"({settings.max_position_size_pct}% = ${max_position_value:.2f})"
        }

    # Place the order
    result = await client.place_order(
        inst_id=symbol.upper(),
        side=side,
        order_type=order_type,
        size=Decimal(str(quantity)),
        price=Decimal(str(price)) if price else None,
    )

    if result.get("code") != "0":
        error_msg = result.get("msg", "Unknown error")
        return {"error": f"Order placement failed: {error_msg}"}

    order_data = result.get("data", [{}])[0]

    return {
        "success": True,
        "order_id": order_data.get("ordId"),
        "client_order_id": order_data.get("clOrdId"),
        "symbol": symbol.upper(),
        "side": side,
        "order_type": order_type,
        "quantity": quantity,
        "price": price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "message": "Order placed successfully",
    }


async def cancel_order(symbol: str, order_id: str) -> dict[str, Any]:
    """Cancel an open order.

    Args:
        symbol: Trading pair
        order_id: Order ID to cancel

    Returns:
        Cancellation result
    """
    client = await OKXClient.create()
    result = await client.cancel_order(inst_id=symbol.upper(), order_id=order_id)

    if result.get("code") != "0":
        error_msg = result.get("msg", "Unknown error")
        return {"error": f"Order cancellation failed: {error_msg}"}

    return {
        "success": True,
        "order_id": order_id,
        "symbol": symbol.upper(),
        "message": "Order cancelled successfully",
    }
