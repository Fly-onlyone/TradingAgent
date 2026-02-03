"""Order Executor subagent for trade execution."""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from beanie import PydanticObjectId

from app.config import get_settings
from app.exchange.okx_client import OKXClient
from app.db.models.order import Order, OrderSide, OrderType, OrderStatus
from app.agent.subagents.risk_manager import RiskManager

logger = logging.getLogger(__name__)
settings = get_settings()


class OrderExecutor:
    """Order execution subagent for managing trades."""

    def __init__(self, user_id: Optional[PydanticObjectId] = None):
        self.client = OKXClient()
        self.risk_manager = RiskManager()
        self.user_id = user_id

    async def execute_trade(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str = "market",
        price: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        reasoning: Optional[dict] = None,
        skip_risk_check: bool = False,
    ) -> dict[str, Any]:
        """Execute a trade with risk management.

        Args:
            symbol: Trading pair (e.g., BTC-USDT)
            side: 'buy' or 'sell'
            quantity: Order quantity
            order_type: 'market' or 'limit'
            price: Limit price (required for limit orders)
            stop_loss: Stop loss price
            take_profit: Take profit price
            reasoning: Agent's reasoning for the trade
            skip_risk_check: Skip risk assessment (not recommended)

        Returns:
            Execution result
        """
        # Validate inputs
        if side not in ["buy", "sell"]:
            return {"success": False, "error": "Invalid side - must be 'buy' or 'sell'"}

        if order_type not in ["market", "limit"]:
            return {
                "success": False,
                "error": "Invalid order type - must be 'market' or 'limit'",
            }

        if order_type == "limit" and price is None:
            return {"success": False, "error": "Limit price required for limit orders"}

        # Risk assessment
        if not skip_risk_check:
            risk_assessment = await self.risk_manager.assess_trade_risk(
                symbol=symbol,
                side=side,
                quantity=quantity,
                entry_price=price,
            )

            if risk_assessment.get("recommendation") == "AVOID":
                return {
                    "success": False,
                    "error": "Trade rejected by risk manager",
                    "risk_assessment": risk_assessment,
                }

            if risk_assessment.get("risk_level") == "HIGH":
                logger.warning(
                    f"High risk trade approved with warnings: {risk_assessment.get('warnings')}"
                )

        # Create order record
        order = Order(
            user_id=self.user_id,
            symbol=symbol.upper(),
            side=OrderSide(side),
            order_type=OrderType(order_type),
            quantity=quantity,
            price=price,
            stop_loss_price=stop_loss,
            take_profit_price=take_profit,
            status=OrderStatus.PENDING,
            agent_reasoning=reasoning,
        )

        if self.user_id:
            await order.insert()

        # Execute on exchange
        try:
            from decimal import Decimal

            result = await self.client.place_order(
                inst_id=symbol.upper(),
                side=side,
                order_type=order_type,
                size=Decimal(str(quantity)),
                price=Decimal(str(price)) if price else None,
            )

            if result.get("code") != "0":
                error_msg = result.get("msg", "Unknown exchange error")
                order.status = OrderStatus.REJECTED
                if self.user_id:
                    await order.save()
                return {
                    "success": False,
                    "error": f"Exchange rejected order: {error_msg}",
                    "order_id": str(order.id) if order.id else None,
                }

            # Update order with exchange info
            order_data = result.get("data", [{}])[0]
            order.exchange_order_id = order_data.get("ordId")
            order.client_order_id = order_data.get("clOrdId")
            order.status = OrderStatus.OPEN

            if self.user_id:
                await order.save()

            return {
                "success": True,
                "order_id": str(order.id) if order.id else None,
                "exchange_order_id": order.exchange_order_id,
                "symbol": symbol.upper(),
                "side": side,
                "order_type": order_type,
                "quantity": quantity,
                "price": price,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "message": "Order executed successfully",
            }

        except Exception as e:
            logger.error(f"Order execution failed: {e}")
            order.status = OrderStatus.REJECTED
            if self.user_id:
                await order.save()
            return {
                "success": False,
                "error": f"Order execution failed: {str(e)}",
                "order_id": str(order.id) if order.id else None,
            }

    async def execute_with_risk_params(
        self,
        symbol: str,
        side: str,
        risk_pct: float = 2.0,
        order_type: str = "market",
        price: Optional[float] = None,
        reasoning: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Execute a trade with automatic position sizing.

        Uses RiskManager to calculate position size based on risk parameters.

        Args:
            symbol: Trading pair
            side: 'buy' or 'sell'
            risk_pct: Percentage of portfolio to risk
            order_type: 'market' or 'limit'
            price: Limit price for limit orders
            reasoning: Agent's reasoning

        Returns:
            Execution result with position sizing details
        """
        # Calculate position size
        position = await self.risk_manager.calculate_position_size(
            symbol=symbol,
            side=side,
            risk_pct=risk_pct,
        )

        if "error" in position:
            return {"success": False, "error": position["error"]}

        # Execute with calculated parameters
        result = await self.execute_trade(
            symbol=symbol,
            side=side,
            quantity=position["position_size"],
            order_type=order_type,
            price=price,
            stop_loss=position["stop_loss_price"],
            take_profit=position["take_profit_price"],
            reasoning=reasoning,
        )

        result["position_sizing"] = position
        return result

    async def cancel_order(
        self,
        symbol: str,
        order_id: str,
    ) -> dict[str, Any]:
        """Cancel an open order.

        Args:
            symbol: Trading pair
            order_id: Exchange order ID or internal order ID

        Returns:
            Cancellation result
        """
        try:
            result = await self.client.cancel_order(
                inst_id=symbol.upper(),
                order_id=order_id,
            )

            if result.get("code") != "0":
                return {
                    "success": False,
                    "error": f"Cancel failed: {result.get('msg', 'Unknown error')}",
                }

            # Update order in database if exists
            if self.user_id:
                order = await Order.find_one(
                    Order.exchange_order_id == order_id,
                    Order.user_id == self.user_id,
                )
                if order:
                    order.status = OrderStatus.CANCELLED
                    order.update_timestamp()
                    await order.save()

            return {
                "success": True,
                "order_id": order_id,
                "symbol": symbol.upper(),
                "message": "Order cancelled successfully",
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Cancel failed: {str(e)}",
            }

    async def get_order_status(
        self,
        symbol: str,
        order_id: str,
    ) -> dict[str, Any]:
        """Get status of an order.

        Args:
            symbol: Trading pair
            order_id: Exchange order ID

        Returns:
            Order status details
        """
        try:
            result = await self.client.get_order(
                inst_id=symbol.upper(),
                order_id=order_id,
            )

            if result.get("code") != "0" or not result.get("data"):
                return {"error": "Order not found"}

            data = result["data"][0]

            return {
                "order_id": data.get("ordId"),
                "symbol": data.get("instId"),
                "side": data.get("side"),
                "order_type": data.get("ordType"),
                "status": data.get("state"),
                "quantity": float(data.get("sz", 0)),
                "filled_quantity": float(data.get("accFillSz", 0)),
                "price": float(data.get("px")) if data.get("px") else None,
                "avg_fill_price": (
                    float(data.get("avgPx")) if data.get("avgPx") else None
                ),
                "created_at": data.get("cTime"),
                "updated_at": data.get("uTime"),
            }

        except Exception as e:
            return {"error": f"Failed to get order status: {str(e)}"}

    async def get_open_orders(
        self,
        symbol: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get all open orders.

        Args:
            symbol: Filter by symbol (optional)

        Returns:
            List of open orders
        """
        try:
            result = await self.client.get_open_orders(
                inst_type="SPOT",
                inst_id=symbol.upper() if symbol else None,
            )

            if result.get("code") != "0":
                return {"error": "Failed to get open orders"}

            orders = []
            for data in result.get("data", []):
                orders.append(
                    {
                        "order_id": data.get("ordId"),
                        "symbol": data.get("instId"),
                        "side": data.get("side"),
                        "order_type": data.get("ordType"),
                        "status": data.get("state"),
                        "quantity": float(data.get("sz", 0)),
                        "filled_quantity": float(data.get("accFillSz", 0)),
                        "price": float(data.get("px")) if data.get("px") else None,
                    }
                )

            return {
                "orders": orders,
                "count": len(orders),
            }

        except Exception as e:
            return {"error": f"Failed to get open orders: {str(e)}"}
