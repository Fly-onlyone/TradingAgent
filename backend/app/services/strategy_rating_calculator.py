"""Calculator for strategy overall ratings."""

from datetime import UTC, datetime

from app.db.models.knowledge import StrategyKnowledge
from app.db.models.strategy_rating import StrategyRating


class StrategyRatingCalculator:
    """Calculates overall strategy ratings from multiple signals."""

    async def calculate_overall_rating(
        self, strategy: StrategyKnowledge
    ) -> tuple[float, float]:
        """Return (rating: 0-100, confidence: 0-1) for a strategy."""
        components: list[tuple[float, float]] = []  # (score, weight)
        data_points = 0

        # --- 40% performance metrics ---
        perf_score = self._performance_score(strategy)
        if perf_score is not None:
            components.append((perf_score, 0.4))
            data_points += 1

        # --- 30% user ratings ---
        user_score = await self._user_rating_score(strategy)
        if user_score is not None:
            components.append((user_score, 0.3))
            data_points += 1

        # --- 20% extraction confidence ---
        extraction_score = self._extraction_confidence_score(strategy)
        if extraction_score is not None:
            components.append((extraction_score, 0.2))
            data_points += 1

        # --- 10% recency ---
        recency_score = self._recency_score(strategy)
        if recency_score is not None:
            components.append((recency_score, 0.1))
            data_points += 1

        if not components:
            return 50.0, 0.0

        # Redistribute weights proportionally when components are missing
        total_weight = sum(w for _, w in components)
        rating = sum(score * (w / total_weight) for score, w in components)
        confidence = min(1.0, data_points / 4)

        return round(rating, 2), round(confidence, 2)

    def _performance_score(self, strategy: StrategyKnowledge) -> float | None:
        """Normalize performance metrics to 0-100."""
        scores: list[float] = []

        if strategy.win_rate is not None:
            scores.append(min(100.0, max(0.0, strategy.win_rate * 100)))

        if strategy.sharpe_ratio is not None:
            # Sharpe 0 -> 0, 1 -> 50, 2 -> 75, 3+ -> 100
            scores.append(min(100.0, max(0.0, strategy.sharpe_ratio * 33.33)))

        if strategy.max_drawdown is not None:
            # Lower drawdown is better: 0% -> 100, 50%+ -> 0
            scores.append(min(100.0, max(0.0, 100 - abs(strategy.max_drawdown) * 2)))

        if strategy.avg_return is not None:
            # Normalize: 0% -> 50, 10%+ -> 100, -10% -> 0
            scores.append(min(100.0, max(0.0, 50 + strategy.avg_return * 5)))

        if not scores:
            return None

        return sum(scores) / len(scores)

    async def _user_rating_score(self, strategy: StrategyKnowledge) -> float | None:
        """Convert average user rating (1-5) to 0-100 scale."""
        if strategy.id is None:
            return None

        ratings = await StrategyRating.find(
            StrategyRating.strategy_knowledge_id == strategy.id
        ).to_list()

        if not ratings:
            return None

        avg = sum(r.rating for r in ratings) / len(ratings)
        # 1-5 stars -> 0-100
        return (avg - 1) * 25

    def _extraction_confidence_score(self, strategy: StrategyKnowledge) -> float | None:
        """Score based on completeness of extracted rules."""
        key_count = 0
        if strategy.entry_rules:
            key_count += len(strategy.entry_rules)
        if strategy.exit_rules:
            key_count += len(strategy.exit_rules)
        if strategy.risk_params:
            key_count += len(strategy.risk_params)

        if key_count == 0:
            return None

        # More keys = higher confidence, cap at 10 keys for 100
        return min(100.0, key_count * 10)

    def _recency_score(self, strategy: StrategyKnowledge) -> float | None:
        """Score based on how recently the strategy was created."""
        if strategy.created_at is None:
            return None

        now = datetime.now(UTC)
        age_days = (now - strategy.created_at).days

        if age_days < 7:
            return 100.0
        if age_days < 30:
            return 85.0
        if age_days < 90:
            return 70.0
        return 50.0
