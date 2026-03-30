"""Source credibility scoring system using MongoDB."""

from datetime import UTC, datetime, timedelta
from typing import Any

from beanie import PydanticObjectId

from app.db.models.news import CredibilityEvent, NewsArticle, NewsSource


class CredibilityScorer:
    """Scores news source credibility based on historical accuracy."""

    BASE_SCORES = {
        "official": 0.90,
        "major_news": 0.75,
        "news": 0.60,
        "blog": 0.40,
        "social": 0.30,
        "unknown": 0.20,
    }

    MAX_ACCURACY_ADJUSTMENT = 0.15
    MAX_REPUTATION_BONUS = 0.10

    async def calculate_score(self, source_id: PydanticObjectId) -> float:
        """Calculate credibility score for a source."""
        source = await NewsSource.get(source_id)
        if not source:
            return 0.20

        base_score = self.BASE_SCORES.get(source.source_type, 0.20)
        accuracy_adjustment = await self._calculate_accuracy_adjustment(source_id)
        reputation_bonus = self._calculate_reputation_bonus(source.created_at)

        final_score = base_score + accuracy_adjustment + reputation_bonus
        return max(0.0, min(1.0, final_score))

    async def _calculate_accuracy_adjustment(self, source_id: PydanticObjectId) -> float:
        """Calculate score adjustment based on prediction accuracy."""
        cutoff = datetime.now(UTC) - timedelta(days=90)

        events = await CredibilityEvent.find(
            CredibilityEvent.source_id == source_id,
            CredibilityEvent.evaluated_at >= cutoff,
        ).to_list()

        if not events:
            return 0.0

        accurate_count = sum(1 for e in events if e.was_accurate)
        accuracy_rate = accurate_count / len(events)

        adjustment = (accuracy_rate - 0.5) * 0.3
        return max(-self.MAX_ACCURACY_ADJUSTMENT, min(self.MAX_ACCURACY_ADJUSTMENT, adjustment))

    def _calculate_reputation_bonus(self, created_at: datetime) -> float:
        """Calculate reputation bonus based on source age."""
        if not created_at:
            return 0.0

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)

        days_tracked = (datetime.now(UTC) - created_at).days
        bonus_ratio = min(days_tracked / 365, 1.0)
        return bonus_ratio * self.MAX_REPUTATION_BONUS

    async def evaluate_prediction(
        self,
        article_id: PydanticObjectId,
        actual_outcome: str,
        prediction_type: str = "price_movement",
        symbol: str = None,
        timeframe_hours: int = None,
    ) -> CredibilityEvent:
        """Evaluate an article's prediction against actual outcome."""
        article = await NewsArticle.get(article_id)
        if not article:
            raise ValueError(f"Article {article_id} not found")

        if not article.predicted_impact:
            raise ValueError(f"Article {article_id} has no prediction")

        was_accurate = self._compare_outcomes(article.predicted_impact, actual_outcome)

        event = CredibilityEvent(
            source_id=article.source_id,
            article_id=article_id,
            prediction_type=prediction_type,
            predicted_outcome=article.predicted_impact,
            actual_outcome=actual_outcome,
            was_accurate=was_accurate,
            confidence_score=article.relevance_score,
            symbol=symbol,
            timeframe_hours=timeframe_hours,
        )
        await event.insert()

        article.actual_impact = actual_outcome
        article.prediction_verified = True
        await article.save()

        await self.update_source_score(article.source_id)
        return event

    def _compare_outcomes(self, predicted: str, actual: str) -> bool:
        """Compare predicted and actual outcomes."""
        predicted_lower = predicted.lower()
        actual_lower = actual.lower()

        if predicted_lower == actual_lower:
            return True

        bullish_terms = {"bullish", "positive", "up", "rise", "gain", "pump"}
        bearish_terms = {"bearish", "negative", "down", "fall", "loss", "dump"}

        predicted_sentiment = None
        actual_sentiment = None

        for term in bullish_terms:
            if term in predicted_lower:
                predicted_sentiment = "bullish"
            if term in actual_lower:
                actual_sentiment = "bullish"

        for term in bearish_terms:
            if term in predicted_lower:
                predicted_sentiment = "bearish"
            if term in actual_lower:
                actual_sentiment = "bearish"

        return predicted_sentiment == actual_sentiment

    async def update_source_score(self, source_id: PydanticObjectId) -> float:
        """Recalculate and update source credibility score."""
        new_score = await self.calculate_score(source_id)
        source = await NewsSource.get(source_id)

        if source:
            source.credibility_score = new_score
            await source.save()

        return new_score

    async def get_source_stats(self, source_id: PydanticObjectId) -> dict[str, Any]:
        """Get detailed credibility statistics for a source."""
        source = await NewsSource.get(source_id)
        if not source:
            return {}

        events = await CredibilityEvent.find(CredibilityEvent.source_id == source_id).to_list()

        accurate_count = sum(1 for e in events if e.was_accurate)
        article_count = await NewsArticle.find(NewsArticle.source_id == source_id).count()

        days_tracked = 0
        if source.created_at:
            created = source.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            days_tracked = (datetime.now(UTC) - created).days

        return {
            "source_id": str(source_id),
            "source_name": source.name,
            "source_type": source.source_type,
            "credibility_score": source.credibility_score,
            "base_score": self.BASE_SCORES.get(source.source_type, 0.20),
            "total_articles": article_count,
            "total_evaluations": len(events),
            "accurate_predictions": accurate_count,
            "accuracy_rate": accurate_count / len(events) if events else None,
            "days_tracked": days_tracked,
        }

    async def get_top_sources(self, limit: int = 10, min_evaluations: int = 5) -> list[dict]:
        """Get top credible sources."""
        sources = (
            await NewsSource.find().sort(-NewsSource.credibility_score).limit(limit * 2).to_list()
        )

        top_sources = []
        for source in sources:
            stats = await self.get_source_stats(source.id)
            if stats.get("total_evaluations", 0) >= min_evaluations:
                top_sources.append(stats)
                if len(top_sources) >= limit:
                    break

        return top_sources
