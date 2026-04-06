"""Rule-based trading pattern detection from historical candle data."""

import logging
from datetime import UTC, datetime

import pandas as pd
import ta

from app.agent.tools.market_tools import get_candlesticks
from app.db.models.knowledge import TradingPattern
from app.db.models.order import Order, OrderStatus, TradeStatus
from app.knowledge.embeddings import TradingPatternEmbeddingGenerator

logger = logging.getLogger(__name__)

DEFAULT_SYMBOLS = ["BTC-USDT", "ETH-USDT", "SOL-USDT"]
DEFAULT_TIMEFRAMES = ["1H", "4H", "1D"]


class PatternMiner:
    """Scans historical candle data for recurring technical patterns."""

    def __init__(self) -> None:
        self._embedding_gen = TradingPatternEmbeddingGenerator()

    async def run_mining_cycle(self, symbols: list[str] | None = None) -> dict:
        """Run one pattern mining cycle across configured symbols.

        Returns stats dict with counts of patterns found/updated.
        """
        if not symbols:
            symbols = await self._get_active_symbols()

        stats = {"symbols_scanned": 0, "patterns_found": 0, "patterns_updated": 0, "errors": 0}

        for symbol in symbols:
            for timeframe in DEFAULT_TIMEFRAMES:
                try:
                    found, updated = await self._scan_symbol_timeframe(symbol, timeframe)
                    stats["patterns_found"] += found
                    stats["patterns_updated"] += updated
                except Exception:
                    logger.warning(
                        "Pattern mining failed for %s/%s", symbol, timeframe, exc_info=True
                    )
                    stats["errors"] += 1
            stats["symbols_scanned"] += 1

        logger.info("Pattern mining cycle complete: %s", stats)
        return stats

    async def _get_active_symbols(self) -> list[str]:
        """Get symbols from recent trades, falling back to defaults."""
        try:
            recent_orders = (
                await Order.find(
                    Order.status == OrderStatus.FILLED,
                )
                .sort(-Order.created_at)
                .limit(50)
                .to_list()
            )
            symbols = list({o.symbol for o in recent_orders})
            if symbols:
                return symbols[:10]  # Cap at 10 symbols
        except Exception:
            logger.debug("Could not load recent order symbols", exc_info=True)
        return DEFAULT_SYMBOLS

    async def _scan_symbol_timeframe(self, symbol: str, timeframe: str) -> tuple[int, int]:
        """Scan a single symbol/timeframe for patterns. Returns (found, updated)."""
        candle_data = await get_candlesticks(symbol, timeframe, limit=200)

        if "error" in candle_data:
            logger.debug("No candle data for %s/%s: %s", symbol, timeframe, candle_data["error"])
            return 0, 0

        candles = candle_data.get("candles", [])
        if len(candles) < 50:
            return 0, 0

        df = pd.DataFrame(candles)

        detectors = [
            self._detect_rsi_divergence,
            self._detect_volume_breakout,
            self._detect_support_bounce,
            self._detect_golden_cross,
        ]

        found = 0
        updated = 0

        for detector in detectors:
            pattern = detector(df, symbol, timeframe)
            if pattern is None:
                continue

            existing = await TradingPattern.find_one(
                TradingPattern.pattern_name == pattern.pattern_name,
                {"symbols": symbol},
            )

            if existing:
                existing.sample_count += 1
                existing.last_validated = datetime.now(UTC)
                # Update success rate with validation
                validated_rate = await self._validate_pattern(symbol, pattern.pattern_name)
                if validated_rate is not None:
                    # Weighted average: 80% existing + 20% new validation
                    existing.success_rate = existing.success_rate * 0.8 + validated_rate * 0.2
                await existing.save()
                updated += 1
            else:
                pattern.symbols = [symbol]
                pattern.timeframes = [timeframe]
                await pattern.insert()

                # Generate embedding
                try:
                    pattern.embedding = await self._embedding_gen.generate_pattern_embedding(
                        pattern.model_dump()
                    )
                    if pattern.embedding is not None:
                        await pattern.save()
                except Exception:
                    logger.warning(
                        "Failed to generate embedding for pattern %s",
                        pattern.pattern_name,
                        exc_info=True,
                    )
                found += 1

        return found, updated

    def _detect_rsi_divergence(
        self, df: pd.DataFrame, symbol: str, timeframe: str
    ) -> TradingPattern | None:
        """Detect RSI bullish divergence: price lower lows, RSI higher lows."""
        if len(df) < 30:
            return None

        rsi = ta.momentum.rsi(df["close"], window=14)
        recent = df.tail(30)
        recent_rsi = rsi.tail(30)

        # Find two lows in price
        price_vals = recent["close"].values
        rsi_vals = recent_rsi.values

        # Simple approach: compare first half low vs second half low
        mid = len(price_vals) // 2
        first_half_price_low = price_vals[:mid].min()
        second_half_price_low = price_vals[mid:].min()
        first_half_rsi_low = rsi_vals[:mid].min()
        second_half_rsi_low = rsi_vals[mid:].min()

        # Bullish divergence: price makes lower low but RSI makes higher low
        if (
            second_half_price_low < first_half_price_low
            and second_half_rsi_low > first_half_rsi_low
        ):
            current_rsi = rsi_vals[-1]
            return TradingPattern(
                pattern_name="RSI Bullish Divergence",
                pattern_type="technical",
                description=(
                    f"RSI bullish divergence detected on {symbol} ({timeframe}). "
                    f"Price made a lower low while RSI made a higher low, "
                    f"suggesting weakening bearish momentum. Current RSI: {current_rsi:.1f}"
                ),
                conditions={
                    "indicator": "RSI-14",
                    "signal": "bullish_divergence",
                    "current_rsi": round(float(current_rsi), 2),
                    "price_low_1": round(float(first_half_price_low), 2),
                    "price_low_2": round(float(second_half_price_low), 2),
                    "rsi_low_1": round(float(first_half_rsi_low), 2),
                    "rsi_low_2": round(float(second_half_rsi_low), 2),
                },
                success_rate=0.6,  # Initial estimate
                sample_count=1,
                avg_return=0.0,
                market_conditions=["bearish", "reversal"],
            )
        return None

    def _detect_volume_breakout(
        self, df: pd.DataFrame, symbol: str, timeframe: str
    ) -> TradingPattern | None:
        """Detect volume spike breakout: volume > 2x SMA-20 AND close above 20-bar high."""
        if len(df) < 25:
            return None

        vol_sma = df["volume"].rolling(window=20).mean()
        high_20 = df["high"].rolling(window=20).max().shift(1)  # Previous 20-bar high

        last = df.iloc[-1]
        last_vol_sma = vol_sma.iloc[-1]
        last_high_20 = high_20.iloc[-1]

        if pd.isna(last_vol_sma) or pd.isna(last_high_20):
            return None

        if last["volume"] > 2 * last_vol_sma and last["close"] > last_high_20:
            return TradingPattern(
                pattern_name="Volume Spike Breakout",
                pattern_type="technical",
                description=(
                    f"Volume spike breakout on {symbol} ({timeframe}). "
                    f"Volume at {last['volume']:.0f} is {last['volume'] / last_vol_sma:.1f}x "
                    f"the 20-period average. Price broke above the 20-bar high of {last_high_20:.2f}."
                ),
                conditions={
                    "indicator": "Volume + Price",
                    "signal": "bullish_breakout",
                    "volume": round(float(last["volume"]), 2),
                    "volume_sma_20": round(float(last_vol_sma), 2),
                    "volume_ratio": round(float(last["volume"] / last_vol_sma), 2),
                    "breakout_level": round(float(last_high_20), 2),
                    "close_price": round(float(last["close"]), 2),
                },
                success_rate=0.55,
                sample_count=1,
                avg_return=0.0,
                market_conditions=["breakout", "high_volume"],
            )
        return None

    def _detect_support_bounce(
        self, df: pd.DataFrame, symbol: str, timeframe: str
    ) -> TradingPattern | None:
        """Detect support bounce: price dips within 1% of 20-period low then closes above."""
        if len(df) < 25:
            return None

        low_20 = df["low"].rolling(window=20).min().shift(1)  # Previous 20-bar low
        last = df.iloc[-1]
        last_low_20 = low_20.iloc[-1]

        if pd.isna(last_low_20) or last_low_20 == 0:
            return None

        # Price dipped within 1% of support and closed above it
        dip_pct = (last["low"] - last_low_20) / last_low_20 * 100
        if -1.0 <= dip_pct <= 1.0 and last["close"] > last_low_20:
            return TradingPattern(
                pattern_name="Support Bounce",
                pattern_type="technical",
                description=(
                    f"Support bounce on {symbol} ({timeframe}). "
                    f"Price dipped to {last['low']:.2f} near the 20-period support "
                    f"at {last_low_20:.2f} ({dip_pct:+.2f}%) and closed above at {last['close']:.2f}."
                ),
                conditions={
                    "indicator": "Price Action",
                    "signal": "bullish_bounce",
                    "support_level": round(float(last_low_20), 2),
                    "low_price": round(float(last["low"]), 2),
                    "close_price": round(float(last["close"]), 2),
                    "dip_from_support_pct": round(float(dip_pct), 2),
                },
                success_rate=0.55,
                sample_count=1,
                avg_return=0.0,
                market_conditions=["support", "range_bound"],
            )
        return None

    def _detect_golden_cross(
        self, df: pd.DataFrame, symbol: str, timeframe: str
    ) -> TradingPattern | None:
        """Detect golden cross: SMA-50 crosses above SMA-200 in the last 5 bars."""
        if len(df) < 200:
            return None

        sma_50 = ta.trend.sma_indicator(df["close"], window=50)
        sma_200 = ta.trend.sma_indicator(df["close"], window=200)

        # Check last 5 bars for crossover
        for i in range(-5, 0):
            prev_50 = sma_50.iloc[i - 1]
            prev_200 = sma_200.iloc[i - 1]
            curr_50 = sma_50.iloc[i]
            curr_200 = sma_200.iloc[i]

            if pd.isna(prev_50) or pd.isna(prev_200) or pd.isna(curr_50) or pd.isna(curr_200):
                continue

            # SMA-50 was below SMA-200, now above
            if prev_50 <= prev_200 and curr_50 > curr_200:
                return TradingPattern(
                    pattern_name="Golden Cross",
                    pattern_type="technical",
                    description=(
                        f"Golden cross on {symbol} ({timeframe}). "
                        f"SMA-50 ({curr_50:.2f}) crossed above SMA-200 ({curr_200:.2f}), "
                        f"signaling potential bullish trend reversal."
                    ),
                    conditions={
                        "indicator": "SMA Crossover",
                        "signal": "bullish_crossover",
                        "sma_50": round(float(curr_50), 2),
                        "sma_200": round(float(curr_200), 2),
                    },
                    success_rate=0.6,
                    sample_count=1,
                    avg_return=0.0,
                    market_conditions=["trend_reversal", "bullish"],
                )
        return None

    async def _validate_pattern(self, symbol: str, pattern_name: str) -> float | None:
        """Validate a pattern's success rate against recent closed trades.

        Returns success rate (0.0-1.0) or None if insufficient data.
        """
        try:
            closed_orders = (
                await Order.find(
                    Order.symbol == symbol,
                    Order.status == OrderStatus.FILLED,
                    Order.trade_status == TradeStatus.CLOSED,
                )
                .sort(-Order.closed_at)
                .limit(20)
                .to_list()
            )

            if len(closed_orders) < 5:
                return None

            profitable = sum(1 for o in closed_orders if (o.realized_pnl or 0) > 0)
            return profitable / len(closed_orders)
        except Exception:
            logger.debug(
                "Could not validate pattern %s for %s", pattern_name, symbol, exc_info=True
            )
            return None
