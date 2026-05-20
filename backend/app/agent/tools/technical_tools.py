"""Technical analysis tools for the trading agent.

DEPRECATED — ATK's `market_get_indicator` exposes 70+ indicators server-side.
Prefer `mcp__okx__market_get_indicator` / `mcp__okx__market_list_indicators`.
Kept importable during the transition. Slated for deletion in a follow-up PR.
"""

import warnings as _warnings
from typing import Any

from app.agent.tools.market_tools import get_candlesticks

_warnings.warn(
    "app.agent.tools.technical_tools is deprecated; use ATK tools (mcp__okx__market_*) instead.",
    DeprecationWarning,
    stacklevel=2,
)


async def get_technical_indicators(
    symbol: str,
    timeframe: str = "1H",
) -> dict[str, Any]:
    """Calculate technical indicators for a symbol.

    Args:
        symbol: Trading pair (e.g., BTC-USDT)
        timeframe: Timeframe for analysis

    Returns:
        Dictionary of technical indicators
    """
    import pandas as pd
    import ta

    # Get candlestick data
    candle_data = await get_candlesticks(symbol, timeframe, limit=200)

    if "error" in candle_data:
        return candle_data

    candles = candle_data.get("candles", [])
    if len(candles) < 50:
        return {"error": "Insufficient data for technical analysis"}

    # Convert to DataFrame
    df = pd.DataFrame(candles)

    # Calculate indicators
    indicators = {}

    # Trend Indicators
    # Moving Averages
    indicators["sma_20"] = round(ta.trend.sma_indicator(df["close"], window=20).iloc[-1], 2)
    indicators["sma_50"] = round(ta.trend.sma_indicator(df["close"], window=50).iloc[-1], 2)
    indicators["sma_200"] = (
        round(ta.trend.sma_indicator(df["close"], window=200).iloc[-1], 2)
        if len(df) >= 200
        else None
    )

    indicators["ema_12"] = round(ta.trend.ema_indicator(df["close"], window=12).iloc[-1], 2)
    indicators["ema_26"] = round(ta.trend.ema_indicator(df["close"], window=26).iloc[-1], 2)

    # MACD
    macd = ta.trend.MACD(df["close"])
    indicators["macd"] = {
        "line": round(macd.macd().iloc[-1], 4),
        "signal": round(macd.macd_signal().iloc[-1], 4),
        "histogram": round(macd.macd_diff().iloc[-1], 4),
    }

    # Trend direction
    current_price = df["close"].iloc[-1]
    if current_price > indicators["sma_50"]:
        trend = "bullish" if current_price > indicators["sma_20"] else "neutral"
    else:
        trend = "bearish" if current_price < indicators["sma_20"] else "neutral"
    indicators["trend"] = trend

    # Momentum Indicators
    # RSI
    indicators["rsi_14"] = round(ta.momentum.rsi(df["close"], window=14).iloc[-1], 2)

    # Stochastic
    stoch = ta.momentum.StochasticOscillator(df["high"], df["low"], df["close"])
    indicators["stochastic"] = {
        "k": round(stoch.stoch().iloc[-1], 2),
        "d": round(stoch.stoch_signal().iloc[-1], 2),
    }

    # Williams %R
    indicators["williams_r"] = round(
        ta.momentum.williams_r(df["high"], df["low"], df["close"]).iloc[-1], 2
    )

    # RSI interpretation
    rsi = indicators["rsi_14"]
    if rsi > 70:
        rsi_signal = "overbought"
    elif rsi < 30:
        rsi_signal = "oversold"
    else:
        rsi_signal = "neutral"
    indicators["rsi_signal"] = rsi_signal

    # Volatility Indicators
    # Bollinger Bands
    bb = ta.volatility.BollingerBands(df["close"])
    indicators["bollinger_bands"] = {
        "upper": round(bb.bollinger_hband().iloc[-1], 2),
        "middle": round(bb.bollinger_mavg().iloc[-1], 2),
        "lower": round(bb.bollinger_lband().iloc[-1], 2),
    }

    # ATR
    indicators["atr_14"] = round(
        ta.volatility.average_true_range(df["high"], df["low"], df["close"]).iloc[-1], 2
    )

    # BB position
    bb_upper = indicators["bollinger_bands"]["upper"]
    bb_lower = indicators["bollinger_bands"]["lower"]
    bb_position = (
        (current_price - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5
    )
    indicators["bb_position"] = round(bb_position, 2)

    # Volume Indicators
    # OBV
    obv = ta.volume.on_balance_volume(df["close"], df["volume"])
    obv_sma = obv.rolling(window=20).mean()
    indicators["obv_trend"] = "bullish" if obv.iloc[-1] > obv_sma.iloc[-1] else "bearish"

    # Volume SMA
    vol_sma = df["volume"].rolling(window=20).mean().iloc[-1]
    current_vol = df["volume"].iloc[-1]
    indicators["volume_ratio"] = round(current_vol / vol_sma, 2) if vol_sma > 0 else 1.0

    # Support/Resistance (simple pivot points)
    high = df["high"].iloc[-1]
    low = df["low"].iloc[-1]
    close = df["close"].iloc[-1]
    pivot = (high + low + close) / 3

    indicators["pivot_points"] = {
        "pivot": round(pivot, 2),
        "r1": round(2 * pivot - low, 2),
        "r2": round(pivot + (high - low), 2),
        "s1": round(2 * pivot - high, 2),
        "s2": round(pivot - (high - low), 2),
    }

    # Recent highs/lows
    indicators["recent_high_20"] = round(df["high"].tail(20).max(), 2)
    indicators["recent_low_20"] = round(df["low"].tail(20).min(), 2)

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "current_price": round(current_price, 2),
        "indicators": indicators,
    }


async def detect_chart_patterns(
    symbol: str,
    timeframe: str = "4H",
) -> dict[str, Any]:
    """Detect chart patterns in price data.

    Args:
        symbol: Trading pair
        timeframe: Timeframe for pattern detection

    Returns:
        Detected patterns with confidence levels
    """
    # Get candlestick data
    candle_data = await get_candlesticks(symbol, timeframe, limit=100)

    if "error" in candle_data:
        return candle_data

    candles = candle_data.get("candles", [])
    if len(candles) < 20:
        return {"error": "Insufficient data for pattern detection"}

    import numpy as np
    import pandas as pd

    df = pd.DataFrame(candles)
    patterns = []

    # Simple pattern detection
    closes = df["close"].values
    highs = df["high"].values
    lows = df["low"].values

    # Double Bottom detection (simplified)
    if len(closes) >= 30:
        recent_lows = lows[-30:]
        min_idx = np.argmin(recent_lows)

        # Look for another low within 10% of the minimum
        threshold = recent_lows[min_idx] * 1.1
        potential_bottoms = np.where(recent_lows < threshold)[0]

        if len(potential_bottoms) >= 2:
            first_bottom = potential_bottoms[0]
            last_bottom = potential_bottoms[-1]

            if last_bottom - first_bottom >= 5:
                between_high = np.max(recent_lows[first_bottom:last_bottom])
                if between_high > threshold:
                    patterns.append(
                        {
                            "pattern": "double_bottom",
                            "type": "bullish",
                            "confidence": 60,
                            "description": "Potential double bottom formation detected",
                        }
                    )

    # Double Top detection (simplified)
    if len(closes) >= 30:
        recent_highs = highs[-30:]
        max_idx = np.argmax(recent_highs)

        threshold = recent_highs[max_idx] * 0.9
        potential_tops = np.where(recent_highs > threshold)[0]

        if len(potential_tops) >= 2:
            first_top = potential_tops[0]
            last_top = potential_tops[-1]

            if last_top - first_top >= 5:
                between_low = np.min(recent_highs[first_top:last_top])
                if between_low < threshold:
                    patterns.append(
                        {
                            "pattern": "double_top",
                            "type": "bearish",
                            "confidence": 60,
                            "description": "Potential double top formation detected",
                        }
                    )

    # Higher highs / Lower lows trend analysis
    if len(closes) >= 10:
        recent_5_high = np.max(highs[-5:])
        prev_5_high = np.max(highs[-10:-5])
        recent_5_low = np.min(lows[-5:])
        prev_5_low = np.min(lows[-10:-5])

        if recent_5_high > prev_5_high and recent_5_low > prev_5_low:
            patterns.append(
                {
                    "pattern": "uptrend",
                    "type": "bullish",
                    "confidence": 70,
                    "description": "Higher highs and higher lows - uptrend confirmed",
                }
            )
        elif recent_5_high < prev_5_high and recent_5_low < prev_5_low:
            patterns.append(
                {
                    "pattern": "downtrend",
                    "type": "bearish",
                    "confidence": 70,
                    "description": "Lower highs and lower lows - downtrend confirmed",
                }
            )

    # Consolidation detection
    if len(closes) >= 20:
        recent_range = np.max(highs[-20:]) - np.min(lows[-20:])
        avg_range = np.mean(highs[-20:] - lows[-20:])

        if recent_range < avg_range * 5:  # Tight range
            patterns.append(
                {
                    "pattern": "consolidation",
                    "type": "neutral",
                    "confidence": 65,
                    "description": "Price consolidating - potential breakout ahead",
                }
            )

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "patterns": patterns,
        "pattern_count": len(patterns),
    }


async def get_price_action(
    symbol: str,
    timeframe: str = "1H",
) -> dict[str, Any]:
    """Analyze candlestick patterns and price action.

    Args:
        symbol: Trading pair
        timeframe: Timeframe for analysis

    Returns:
        Price action analysis including candlestick patterns
    """
    candle_data = await get_candlesticks(symbol, timeframe, limit=50)

    if "error" in candle_data:
        return candle_data

    candles = candle_data.get("candles", [])
    if len(candles) < 10:
        return {"error": "Insufficient data for price action analysis"}

    import pandas as pd

    df = pd.DataFrame(candles)
    patterns = []

    # Analyze last few candles
    for i in range(-3, 0):
        if i >= -len(df):
            o = df["open"].iloc[i]
            h = df["high"].iloc[i]
            low = df["low"].iloc[i]
            c = df["close"].iloc[i]

            body = abs(c - o)
            upper_wick = h - max(o, c)
            lower_wick = min(o, c) - low
            total_range = h - low

            if total_range > 0:
                body_ratio = body / total_range

                # Doji
                if body_ratio < 0.1:
                    patterns.append(
                        {
                            "candle": i,
                            "pattern": "doji",
                            "signal": "indecision",
                        }
                    )

                # Hammer / Hanging Man
                elif lower_wick > body * 2 and upper_wick < body * 0.5:
                    if c > o:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "hammer",
                                "signal": "bullish",
                            }
                        )
                    else:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "hanging_man",
                                "signal": "bearish",
                            }
                        )

                # Shooting Star / Inverted Hammer
                elif upper_wick > body * 2 and lower_wick < body * 0.5:
                    if c < o:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "shooting_star",
                                "signal": "bearish",
                            }
                        )
                    else:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "inverted_hammer",
                                "signal": "bullish",
                            }
                        )

                # Marubozu (strong candle)
                elif body_ratio > 0.9:
                    if c > o:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "bullish_marubozu",
                                "signal": "strong_bullish",
                            }
                        )
                    else:
                        patterns.append(
                            {
                                "candle": i,
                                "pattern": "bearish_marubozu",
                                "signal": "strong_bearish",
                            }
                        )

    # Engulfing pattern detection
    if len(df) >= 2:
        prev_o, prev_c = df["open"].iloc[-2], df["close"].iloc[-2]
        curr_o, curr_c = df["open"].iloc[-1], df["close"].iloc[-1]

        # Bullish engulfing
        if prev_c < prev_o and curr_c > curr_o:  # Previous red, current green
            if curr_o <= prev_c and curr_c >= prev_o:
                patterns.append(
                    {
                        "candle": -1,
                        "pattern": "bullish_engulfing",
                        "signal": "bullish",
                    }
                )

        # Bearish engulfing
        if prev_c > prev_o and curr_c < curr_o:  # Previous green, current red
            if curr_o >= prev_c and curr_c <= prev_o:
                patterns.append(
                    {
                        "candle": -1,
                        "pattern": "bearish_engulfing",
                        "signal": "bearish",
                    }
                )

    # Overall price action summary
    last_5_close = df["close"].tail(5)
    price_direction = "up" if last_5_close.iloc[-1] > last_5_close.iloc[0] else "down"
    volatility = df["high"].tail(10).std() / df["close"].tail(10).mean() * 100

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "candlestick_patterns": patterns,
        "price_direction": price_direction,
        "volatility_pct": round(volatility, 2),
        "last_close": round(df["close"].iloc[-1], 2),
    }
