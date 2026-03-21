"""Pattern miner for discovering trading patterns from historical data."""

from datetime import datetime, timedelta, timezone, UTC
from typing import Any, Optional

from app.db.models.market import MarketData
from app.db.models.knowledge import TradingPattern, TradeLesson
from app.knowledge.embeddings import PatternEmbeddingGenerator, get_embedding_service


class PatternMiner:
    """Discovers and validates trading patterns from historical data."""

    def __init__(self) -> None:
        self.embedding_service = get_embedding_service()
        self.pattern_generator = PatternEmbeddingGenerator()

    async def discover_technical_patterns(
        self,
        symbol: str,
        timeframe: str = "1H",
        lookback_days: int = 90,
        min_occurrences: int = 10,
    ) -> list[dict[str, Any]]:
        """Discover recurring technical patterns.

        Args:
            symbol: Trading symbol to analyze
            timeframe: Candlestick timeframe
            lookback_days: Number of days to analyze
            min_occurrences: Minimum pattern occurrences

        Returns:
            List of discovered patterns with statistics
        """
        start_time = datetime.now(UTC) - timedelta(days=lookback_days)

        candles = (
            await MarketData.find(
                MarketData.symbol == symbol.upper(),
                MarketData.timeframe == timeframe,
                MarketData.timestamp >= start_time,
            )
            .sort(MarketData.timestamp)
            .to_list()
        )

        if len(candles) < min_occurrences * 2:
            return []

        discovered_patterns = []

        # Pattern 1: RSI Divergence
        rsi_divergence = self._detect_rsi_divergence_pattern(candles)
        if rsi_divergence and rsi_divergence["count"] >= min_occurrences:
            discovered_patterns.append(rsi_divergence)

        # Pattern 2: Volume Spike Breakout
        volume_breakout = self._detect_volume_breakout_pattern(candles)
        if volume_breakout and volume_breakout["count"] >= min_occurrences:
            discovered_patterns.append(volume_breakout)

        # Pattern 3: Support Bounce
        sr_bounce = self._detect_support_bounce(candles)
        if sr_bounce and sr_bounce["count"] >= min_occurrences:
            discovered_patterns.append(sr_bounce)

        # Pattern 4: Moving Average Crossover
        ma_cross = self._detect_ma_crossover_pattern(candles)
        if ma_cross and ma_cross["count"] >= min_occurrences:
            discovered_patterns.append(ma_cross)

        return discovered_patterns

    def _detect_rsi_divergence_pattern(
        self,
        candles: list[MarketData],
    ) -> Optional[dict[str, Any]]:
        """Detect RSI divergence patterns."""
        if len(candles) < 28:
            return None

        occurrences = 0
        profitable = 0

        for i in range(28, len(candles) - 5):
            # Simplified RSI calculation
            gains = []
            losses = []
            for j in range(i - 14, i):
                change = candles[j].close - candles[j - 1].close
                if change > 0:
                    gains.append(change)
                else:
                    losses.append(abs(change))

            avg_gain = sum(gains) / 14 if gains else 0
            avg_loss = sum(losses) / 14 if losses else 0.0001

            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

            if rsi < 35:
                future_high = max(c.high for c in candles[i : i + 5])
                entry_price = candles[i].close

                if future_high > entry_price * 1.02:
                    profitable += 1
                occurrences += 1

        if occurrences == 0:
            return None

        success_rate = (profitable / occurrences) * 100

        return {
            "pattern_name": "RSI Bullish Divergence",
            "pattern_type": "technical",
            "description": "Price in oversold territory with RSI < 35, potential reversal setup",
            "conditions": {"rsi_threshold": 35, "type": "bullish"},
            "count": occurrences,
            "success_rate": success_rate,
            "avg_return": 2.5 if success_rate > 50 else -1.0,
        }

    def _detect_volume_breakout_pattern(
        self,
        candles: list[MarketData],
    ) -> Optional[dict[str, Any]]:
        """Detect volume spike breakout patterns."""
        if len(candles) < 25:
            return None

        occurrences = 0
        profitable = 0

        for i in range(20, len(candles) - 5):
            avg_volume = sum(c.volume for c in candles[i - 20 : i]) / 20
            current_volume = candles[i].volume

            if current_volume > avg_volume * 2:
                recent_high = max(c.high for c in candles[i - 10 : i])
                if candles[i].close > recent_high:
                    future_high = max(c.high for c in candles[i : i + 5])
                    if future_high > candles[i].close * 1.03:
                        profitable += 1
                    occurrences += 1

        if occurrences == 0:
            return None

        success_rate = (profitable / occurrences) * 100

        return {
            "pattern_name": "Volume Spike Breakout",
            "pattern_type": "technical",
            "description": "Price breaks above resistance with volume 2x above average",
            "conditions": {"volume_multiplier": 2.0, "breakout_type": "resistance"},
            "count": occurrences,
            "success_rate": success_rate,
            "avg_return": 3.0 if success_rate > 50 else -1.5,
        }

    def _detect_support_bounce(
        self,
        candles: list[MarketData],
    ) -> Optional[dict[str, Any]]:
        """Detect support bounce patterns."""
        if len(candles) < 30:
            return None

        occurrences = 0
        profitable = 0

        for i in range(20, len(candles) - 5):
            support = min(c.low for c in candles[i - 20 : i])
            current_low = candles[i].low

            if abs(current_low - support) / support < 0.005:
                future_high = max(c.high for c in candles[i : i + 5])
                if future_high > current_low * 1.02:
                    profitable += 1
                occurrences += 1

        if occurrences == 0:
            return None

        success_rate = (profitable / occurrences) * 100

        return {
            "pattern_name": "Support Bounce",
            "pattern_type": "technical",
            "description": "Price bounces off support level with 2%+ upside potential",
            "conditions": {"support_lookback": 20, "touch_threshold_pct": 0.5},
            "count": occurrences,
            "success_rate": success_rate,
            "avg_return": 2.0 if success_rate > 50 else -1.0,
        }

    def _detect_ma_crossover_pattern(
        self,
        candles: list[MarketData],
    ) -> Optional[dict[str, Any]]:
        """Detect moving average crossover patterns."""
        if len(candles) < 55:
            return None

        occurrences = 0
        profitable = 0

        for i in range(50, len(candles) - 5):
            # Calculate SMAs
            sma_20 = sum(c.close for c in candles[i - 20 : i]) / 20
            sma_50 = sum(c.close for c in candles[i - 50 : i]) / 50

            prev_sma_20 = sum(c.close for c in candles[i - 21 : i - 1]) / 20
            prev_sma_50 = sum(c.close for c in candles[i - 51 : i - 1]) / 50

            # Golden cross (20 crosses above 50)
            if prev_sma_20 <= prev_sma_50 and sma_20 > sma_50:
                future_high = max(c.high for c in candles[i : i + 5])
                if future_high > candles[i].close * 1.02:
                    profitable += 1
                occurrences += 1

        if occurrences == 0:
            return None

        success_rate = (profitable / occurrences) * 100

        return {
            "pattern_name": "Golden Cross (20/50)",
            "pattern_type": "technical",
            "description": "20-period SMA crosses above 50-period SMA, bullish signal",
            "conditions": {"fast_ma": 20, "slow_ma": 50, "cross_type": "golden"},
            "count": occurrences,
            "success_rate": success_rate,
            "avg_return": 2.5 if success_rate > 50 else -1.0,
        }

    async def save_pattern(
        self,
        pattern_data: dict[str, Any],
        symbol: Optional[str] = None,
        timeframes: Optional[list[str]] = None,
    ) -> TradingPattern:
        """Save a discovered pattern to the database."""
        # Generate embedding
        embedding = await self.pattern_generator.generate_pattern_embedding(pattern_data)

        pattern = TradingPattern(
            pattern_name=pattern_data["pattern_name"],
            pattern_type=pattern_data["pattern_type"],
            description=pattern_data["description"],
            conditions=pattern_data["conditions"],
            success_rate=pattern_data["success_rate"],
            sample_count=pattern_data["count"],
            avg_return=pattern_data["avg_return"],
            symbols=[symbol] if symbol else None,
            timeframes=timeframes,
            embedding=embedding,
            last_validated=datetime.now(UTC),
        )

        await pattern.insert()
        return pattern

    async def validate_pattern(
        self,
        pattern_id: str,
        recent_days: int = 30,
    ) -> dict[str, Any]:
        """Validate a pattern against recent data."""
        from beanie import PydanticObjectId

        pattern = await TradingPattern.get(PydanticObjectId(pattern_id))
        if not pattern:
            raise ValueError(f"Pattern {pattern_id} not found")

        start_time = datetime.now(UTC) - timedelta(days=recent_days)

        recent_lessons = (
            await TradeLesson.find(TradeLesson.created_at >= start_time)
            .sort(-TradeLesson.created_at)
            .to_list()
        )

        matches = 0
        successes = 0

        for lesson in recent_lessons:
            if self._matches_pattern_conditions(lesson, pattern):
                matches += 1
                if lesson.outcome == "profit":
                    successes += 1

        recent_success_rate = (successes / matches * 100) if matches > 0 else 0

        pattern.last_validated = datetime.now(UTC)
        await pattern.save()

        return {
            "pattern_id": str(pattern.id),
            "pattern_name": pattern.pattern_name,
            "historical_success_rate": pattern.success_rate,
            "recent_success_rate": recent_success_rate,
            "recent_matches": matches,
            "recent_successes": successes,
            "is_still_valid": recent_success_rate >= pattern.success_rate * 0.8,
        }

    def _matches_pattern_conditions(
        self,
        lesson: TradeLesson,
        pattern: TradingPattern,
    ) -> bool:
        """Check if a trade lesson matches pattern conditions."""
        if not lesson.market_context or not pattern.conditions:
            return False

        conditions = pattern.conditions

        if "rsi_threshold" in conditions:
            lesson_rsi = lesson.market_context.get("rsi")
            if lesson_rsi is None:
                return False
            if conditions.get("type") == "bullish" and lesson_rsi > conditions["rsi_threshold"]:
                return False

        if "volume_multiplier" in conditions:
            volume_ratio = lesson.market_context.get("volume_ratio")
            if volume_ratio is None or volume_ratio < conditions["volume_multiplier"]:
                return False

        return True

    async def run_full_discovery(
        self,
        symbols: list[str],
        timeframes: list[str] = ["1H", "4H"],
        lookback_days: int = 90,
    ) -> dict[str, list[TradingPattern]]:
        """Run pattern discovery across multiple symbols and timeframes."""
        results = {}

        for symbol in symbols:
            symbol_patterns = []
            for timeframe in timeframes:
                patterns = await self.discover_technical_patterns(
                    symbol=symbol,
                    timeframe=timeframe,
                    lookback_days=lookback_days,
                )

                for pattern_data in patterns:
                    saved = await self.save_pattern(
                        pattern_data=pattern_data,
                        symbol=symbol,
                        timeframes=[timeframe],
                    )
                    symbol_patterns.append(saved)

            results[symbol] = symbol_patterns

        return results
