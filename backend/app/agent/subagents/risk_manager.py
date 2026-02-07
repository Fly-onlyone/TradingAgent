"""Risk Manager subagent for position sizing and risk assessment."""

from typing import Any

from app.agent.tools.market_tools import get_ticker
from app.agent.tools.technical_tools import get_technical_indicators
from app.agent.tools.trading_tools import get_account_balance
from app.config import get_settings

settings = get_settings()


class RiskManager:
    """Risk management subagent for position sizing and risk control."""

    def __init__(self):
        self.max_position_pct = settings.max_position_size_pct
        self.default_stop_loss_pct = settings.default_stop_loss_pct
        self.default_take_profit_pct = settings.default_take_profit_pct

    async def calculate_position_size(
        self,
        symbol: str,
        side: str,
        risk_pct: float = 2.0,
        stop_loss_pct: float | None = None,
    ) -> dict[str, Any]:
        """Calculate optimal position size based on risk parameters.

        Args:
            symbol: Trading pair
            side: 'buy' or 'sell'
            risk_pct: Percentage of portfolio to risk (default 2%)
            stop_loss_pct: Stop loss percentage from entry

        Returns:
            Position sizing recommendation
        """
        # Get account balance
        balance = await get_account_balance()
        if "error" in balance:
            return {"error": "Could not get account balance"}

        total_equity = balance.get("total_equity_usd", 0)
        if total_equity <= 0:
            return {"error": "No available equity"}

        # Get current price
        ticker = await get_ticker(symbol)
        if "error" in ticker:
            return {"error": f"Could not get price for {symbol}"}

        current_price = ticker.get("last_price", 0)
        if current_price <= 0:
            return {"error": "Invalid price"}

        # Get volatility for dynamic stop loss
        indicators = await get_technical_indicators(symbol, "1H")
        atr = indicators.get("indicators", {}).get("atr_14", 0)

        # Calculate stop loss
        if stop_loss_pct is None:
            # Use ATR-based stop loss (1.5x ATR)
            if atr > 0:
                stop_loss_pct = (atr * 1.5 / current_price) * 100
            else:
                stop_loss_pct = self.default_stop_loss_pct

        # Ensure minimum stop loss
        stop_loss_pct = max(stop_loss_pct, 0.5)

        # Calculate risk amount
        risk_amount = total_equity * (risk_pct / 100)

        # Position size = Risk Amount / Stop Loss Distance
        stop_loss_distance = current_price * (stop_loss_pct / 100)
        position_size = risk_amount / stop_loss_distance

        # Calculate position value
        position_value = position_size * current_price

        # Check against max position size
        max_position_value = total_equity * (self.max_position_pct / 100)
        if position_value > max_position_value:
            position_value = max_position_value
            position_size = position_value / current_price

        # Calculate stop loss and take profit prices
        if side == "buy":
            stop_loss_price = current_price * (1 - stop_loss_pct / 100)
            take_profit_price = current_price * (1 + self.default_take_profit_pct / 100)
        else:
            stop_loss_price = current_price * (1 + stop_loss_pct / 100)
            take_profit_price = current_price * (1 - self.default_take_profit_pct / 100)

        # Risk/Reward ratio
        risk_reward = self.default_take_profit_pct / stop_loss_pct

        return {
            "symbol": symbol,
            "side": side,
            "current_price": round(current_price, 2),
            "position_size": round(position_size, 8),
            "position_value_usd": round(position_value, 2),
            "position_pct_of_portfolio": round(
                (position_value / total_equity) * 100, 2
            ),
            "risk_amount_usd": round(risk_amount, 2),
            "risk_pct": risk_pct,
            "stop_loss_price": round(stop_loss_price, 2),
            "stop_loss_pct": round(stop_loss_pct, 2),
            "take_profit_price": round(take_profit_price, 2),
            "take_profit_pct": self.default_take_profit_pct,
            "risk_reward_ratio": round(risk_reward, 2),
            "atr_14": round(atr, 2) if atr else None,
            "total_equity": round(total_equity, 2),
        }

    async def assess_trade_risk(
        self,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float | None = None,
    ) -> dict[str, Any]:
        """Assess the risk of a proposed trade.

        Args:
            symbol: Trading pair
            side: 'buy' or 'sell'
            quantity: Proposed quantity
            entry_price: Entry price (uses current price if not provided)

        Returns:
            Risk assessment with warnings
        """
        warnings = []
        risk_score = 0  # 0-100, higher = riskier

        # Get account balance
        balance = await get_account_balance()
        if "error" in balance:
            return {"error": "Could not assess risk - balance unavailable"}

        total_equity = balance.get("total_equity_usd", 0)

        # Get current price
        ticker = await get_ticker(symbol)
        if "error" in ticker:
            return {"error": f"Could not assess risk - price unavailable for {symbol}"}

        current_price = entry_price or ticker.get("last_price", 0)

        # Calculate position value
        position_value = quantity * current_price
        position_pct = (
            (position_value / total_equity) * 100 if total_equity > 0 else 100
        )

        # Check position size
        if position_pct > self.max_position_pct:
            warnings.append(
                f"Position size ({position_pct:.1f}%) exceeds max allowed ({self.max_position_pct}%)"
            )
            risk_score += 30

        if position_pct > self.max_position_pct * 0.8:
            warnings.append("Position size approaching max limit")
            risk_score += 15

        # Get technical indicators for volatility assessment
        indicators = await get_technical_indicators(symbol, "1H")
        ind_data = indicators.get("indicators", {})

        # Check RSI
        rsi = ind_data.get("rsi_14")
        if rsi:
            if side == "buy" and rsi > 70:
                warnings.append(f"RSI ({rsi:.0f}) indicates overbought - risky to buy")
                risk_score += 20
            elif side == "sell" and rsi < 30:
                warnings.append(f"RSI ({rsi:.0f}) indicates oversold - risky to sell")
                risk_score += 20

        # Check Bollinger Band position
        bb_pos = ind_data.get("bb_position")
        if bb_pos:
            if side == "buy" and bb_pos > 0.9:
                warnings.append(
                    "Price near upper Bollinger Band - potential resistance"
                )
                risk_score += 15
            elif side == "sell" and bb_pos < 0.1:
                warnings.append("Price near lower Bollinger Band - potential support")
                risk_score += 15

        # Check volatility
        atr = ind_data.get("atr_14")
        if atr and current_price:
            atr_pct = (atr / current_price) * 100
            if atr_pct > 5:
                warnings.append(
                    f"High volatility (ATR {atr_pct:.1f}%) - increased risk"
                )
                risk_score += 20

        # Check trend alignment
        trend = ind_data.get("trend")
        if trend:
            if side == "buy" and trend == "bearish":
                warnings.append("Buying against bearish trend")
                risk_score += 15
            elif side == "sell" and trend == "bullish":
                warnings.append("Selling against bullish trend")
                risk_score += 15

        # Determine risk level
        if risk_score >= 60:
            risk_level = "HIGH"
            recommendation = "AVOID"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
            recommendation = "CAUTION"
        elif risk_score >= 20:
            risk_level = "LOW-MEDIUM"
            recommendation = "ACCEPTABLE"
        else:
            risk_level = "LOW"
            recommendation = "PROCEED"

        return {
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "entry_price": round(current_price, 2),
            "position_value_usd": round(position_value, 2),
            "position_pct": round(position_pct, 2),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "warnings": warnings,
            "indicators": {
                "rsi": rsi,
                "trend": trend,
                "bb_position": bb_pos,
                "atr_pct": (
                    round((atr / current_price) * 100, 2)
                    if atr and current_price
                    else None
                ),
            },
        }

    async def get_portfolio_risk(self) -> dict[str, Any]:
        """Get overall portfolio risk assessment.

        Returns:
            Portfolio-level risk metrics
        """
        balance = await get_account_balance()
        if "error" in balance:
            return {"error": "Could not get portfolio info"}

        total_equity = balance.get("total_equity_usd", 0)
        balances = balance.get("balances", {})

        # Calculate concentration risk
        asset_values = []
        for currency, data in balances.items():
            equity = data.get("equity", 0)
            if equity > 0:
                asset_values.append(
                    {
                        "currency": currency,
                        "value": equity,
                        "pct": (equity / total_equity) * 100 if total_equity > 0 else 0,
                    }
                )

        # Sort by value
        asset_values.sort(key=lambda x: x["value"], reverse=True)

        # Check concentration
        warnings = []
        if asset_values and asset_values[0]["pct"] > 50:
            warnings.append(
                f"High concentration in {asset_values[0]['currency']} ({asset_values[0]['pct']:.1f}%)"
            )

        return {
            "total_equity_usd": round(total_equity, 2),
            "asset_count": len(asset_values),
            "top_holdings": asset_values[:5],
            "concentration_warnings": warnings,
            "max_new_position_usd": round(
                total_equity * (self.max_position_pct / 100), 2
            ),
        }
