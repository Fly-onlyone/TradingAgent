"""Knowledge retriever for RAG-based strategy and lesson search using MongoDB."""

from datetime import UTC, datetime

from pymongo import DESCENDING

from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.knowledge.embeddings import EmbeddingService, get_embedding_service


class KnowledgeRetriever:
    """RAG retriever for finding relevant trading knowledge."""

    def __init__(self) -> None:
        self.embedding_service: EmbeddingService = get_embedding_service()

    async def search_strategies(
        self,
        query: str,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
    ) -> list[StrategyKnowledge]:
        """Search for strategies similar to the query."""
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(
                query
            )
        if query_embedding is None:
            return []

        strategies = await StrategyKnowledge.find(
            {"embedding": {"$exists": True, "$ne": None}}
        ).to_list()

        scored: list[tuple[StrategyKnowledge, float]] = []
        for strategy in strategies:
            if strategy.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, strategy.embedding
                )
                if similarity >= min_similarity:
                    scored.append(
                        (
                            strategy,
                            self._score_strategy(
                                strategy,
                                similarity,
                                timeframes=timeframes,
                                market_conditions=market_conditions,
                            ),
                        )
                    )

        scored.sort(key=lambda item: item[1], reverse=True)
        return [strategy for strategy, _score in scored[:limit]]

    async def search_lessons(
        self,
        query: str,
        symbol: str | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[TradeLesson]:
        """Search for trade lessons similar to the query."""
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(
                query
            )
        if query_embedding is None:
            return []

        filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
        if symbol:
            filter_query["symbol"] = symbol.upper()

        lessons = await TradeLesson.find(filter_query).to_list()

        scored: list[tuple[TradeLesson, float]] = []
        for lesson in lessons:
            if lesson.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, lesson.embedding
                )
                if similarity >= min_similarity:
                    scored.append(
                        (
                            lesson,
                            self._score_lesson(
                                lesson, similarity, requested_symbol=symbol
                            ),
                        )
                    )

        scored.sort(key=lambda item: item[1], reverse=True)
        return [lesson for lesson, _score in scored[:limit]]

    async def search_patterns(
        self,
        query: str,
        pattern_type: str | None = None,
        min_success_rate: float | None = None,
        symbol: str | None = None,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[TradingPattern]:
        """Search for trading patterns similar to the query."""
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(
                query
            )
        if query_embedding is None:
            return []

        filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
        if pattern_type:
            filter_query["pattern_type"] = pattern_type
        if min_success_rate is not None:
            filter_query["success_rate"] = {"$gte": min_success_rate}

        patterns = await TradingPattern.find(filter_query).to_list()

        scored: list[tuple[TradingPattern, float]] = []
        for pattern in patterns:
            if pattern.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, pattern.embedding
                )
                if similarity >= min_similarity:
                    scored.append(
                        (
                            pattern,
                            self._score_pattern(
                                pattern,
                                similarity,
                                requested_symbol=symbol,
                                timeframes=timeframes,
                                market_conditions=market_conditions,
                            ),
                        )
                    )

        scored.sort(key=lambda item: item[1], reverse=True)
        return [pattern for pattern, _score in scored[:limit]]

    async def search_all(
        self,
        query: str,
        limit_per_type: int = 3,
        min_similarity: float = 0.6,
        symbol: str | None = None,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
    ) -> dict[str, list]:
        """Search across all knowledge types with one shared query embedding."""
        query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return {"strategies": [], "lessons": [], "patterns": []}

        strategies = await self.search_strategies(
            query,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
            timeframes=timeframes,
            market_conditions=market_conditions,
        )
        lessons = await self.search_lessons(
            query,
            symbol=symbol,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
        )
        patterns = await self.search_patterns(
            query,
            symbol=symbol,
            timeframes=timeframes,
            market_conditions=market_conditions,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
        )

        return {
            "strategies": strategies,
            "lessons": lessons,
            "patterns": patterns,
        }

    async def get_relevant_context(
        self,
        query: str,
        max_results: int = 6,
        symbol: str | None = None,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
    ) -> str:
        """Get relevant knowledge formatted as context for the agent."""
        results = await self.search_all(
            query,
            limit_per_type=max(max_results // 3, 1),
            min_similarity=0.5,
            symbol=symbol,
            timeframes=timeframes,
            market_conditions=market_conditions,
        )

        context_parts: list[str] = []

        if results["strategies"]:
            context_parts.append("## Relevant Strategies")
            for strategy in results["strategies"]:
                context_parts.append(self._format_strategy_context(strategy))

        if results["lessons"]:
            context_parts.append("## Relevant Trade Lessons")
            for lesson in results["lessons"]:
                context_parts.append(self._format_lesson_context(lesson))

        if results["patterns"]:
            context_parts.append("## Relevant Patterns")
            for pattern in results["patterns"]:
                context_parts.append(self._format_pattern_context(pattern))

        if not context_parts:
            return "No relevant knowledge found."

        return "\n".join(context_parts)

    async def get_strategy_by_name(self, name: str) -> StrategyKnowledge | None:
        """Get a strategy by exact name match."""
        return await StrategyKnowledge.find_one(StrategyKnowledge.name == name)

    async def get_lessons_by_symbol(
        self,
        symbol: str,
        outcome: str | None = None,
        limit: int = 10,
    ) -> list[TradeLesson]:
        """Get lessons for a specific symbol."""
        query = TradeLesson.find(TradeLesson.symbol == symbol.upper())
        if outcome:
            query = query.find(TradeLesson.outcome == outcome)
        return await query.sort([("created_at", DESCENDING)]).limit(limit).to_list()

    async def get_patterns_by_type(
        self,
        pattern_type: str,
        min_success_rate: float = 50.0,
        limit: int = 10,
    ) -> list[TradingPattern]:
        """Get patterns by type with minimum success rate."""
        return (
            await TradingPattern.find(
                TradingPattern.pattern_type == pattern_type,
                TradingPattern.success_rate >= min_success_rate,
            )
            .sort([("success_rate", DESCENDING)])
            .limit(limit)
            .to_list()
        )

    @staticmethod
    def _score_strategy(
        strategy: StrategyKnowledge,
        similarity: float,
        *,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
    ) -> float:
        score = similarity
        score += KnowledgeRetriever._recency_bonus(
            strategy.updated_at, horizon_days=365, max_bonus=0.03
        )
        score += KnowledgeRetriever._ratio_bonus(
            strategy.win_rate, scale=100, max_bonus=0.08
        )
        score += KnowledgeRetriever._ratio_bonus(
            strategy.sharpe_ratio, scale=4, max_bonus=0.05
        )
        score += KnowledgeRetriever._overlap_bonus(
            strategy.timeframes, timeframes, item_bonus=0.03, max_bonus=0.06
        )
        score += KnowledgeRetriever._overlap_bonus(
            strategy.market_conditions,
            market_conditions,
            item_bonus=0.02,
            max_bonus=0.04,
        )
        return score

    @staticmethod
    def _score_lesson(
        lesson: TradeLesson,
        similarity: float,
        *,
        requested_symbol: str | None = None,
    ) -> float:
        score = similarity
        score += KnowledgeRetriever._recency_bonus(
            lesson.created_at, horizon_days=60, max_bonus=0.10
        )
        score += KnowledgeRetriever._ratio_bonus(
            abs(lesson.profit_pct), scale=10, max_bonus=0.05
        )
        if requested_symbol and lesson.symbol.upper() == requested_symbol.upper():
            score += 0.08
        return score

    @staticmethod
    def _score_pattern(
        pattern: TradingPattern,
        similarity: float,
        *,
        requested_symbol: str | None = None,
        timeframes: list[str] | None = None,
        market_conditions: list[str] | None = None,
    ) -> float:
        score = similarity
        validation_ts = pattern.last_validated or pattern.created_at
        score += KnowledgeRetriever._recency_bonus(
            validation_ts, horizon_days=60, max_bonus=0.10
        )
        score += KnowledgeRetriever._ratio_bonus(
            pattern.success_rate, scale=100, max_bonus=0.10
        )
        score += KnowledgeRetriever._ratio_bonus(
            pattern.sample_count, scale=50, max_bonus=0.08
        )
        score += KnowledgeRetriever._overlap_bonus(
            pattern.symbols,
            [requested_symbol] if requested_symbol else None,
            item_bonus=0.05,
            max_bonus=0.05,
        )
        score += KnowledgeRetriever._overlap_bonus(
            pattern.timeframes, timeframes, item_bonus=0.05, max_bonus=0.05
        )
        score += KnowledgeRetriever._overlap_bonus(
            pattern.market_conditions,
            market_conditions,
            item_bonus=0.03,
            max_bonus=0.03,
        )
        return score

    @staticmethod
    def _ratio_bonus(value: float | None, *, scale: float, max_bonus: float) -> float:
        if value is None or scale <= 0:
            return 0.0
        normalized = max(0.0, min(float(value) / scale, 1.0))
        return normalized * max_bonus

    @staticmethod
    def _recency_bonus(
        timestamp: datetime | None,
        *,
        horizon_days: int,
        max_bonus: float,
    ) -> float:
        if timestamp is None or horizon_days <= 0:
            return 0.0
        age_days = max((datetime.now(UTC) - timestamp).total_seconds() / 86400, 0.0)
        freshness = max(0.0, 1.0 - (age_days / horizon_days))
        return freshness * max_bonus

    @staticmethod
    def _overlap_bonus(
        values: list[str] | None,
        requested: list[str] | None,
        *,
        item_bonus: float,
        max_bonus: float,
    ) -> float:
        if not values or not requested:
            return 0.0
        values_normalized = {value.strip().lower() for value in values if value}
        requested_normalized = {value.strip().lower() for value in requested if value}
        overlap = len(values_normalized & requested_normalized)
        return min(overlap * item_bonus, max_bonus)

    def _format_strategy_context(self, strategy: StrategyKnowledge) -> str:
        desc = self._truncate(strategy.description, 160)
        metadata = [
            self._format_metric("win rate", strategy.win_rate, suffix="%"),
            self._format_metric("sharpe", strategy.sharpe_ratio),
            self._format_list("timeframes", strategy.timeframes),
            self._format_list("market", strategy.market_conditions),
            self._format_dict_summary("risk", strategy.risk_params),
        ]
        metadata_text = " | ".join(part for part in metadata if part)
        if metadata_text:
            return f"- **{strategy.name}** | {metadata_text}: {desc}"
        return f"- **{strategy.name}**: {desc}"

    def _format_lesson_context(self, lesson: TradeLesson) -> str:
        summary = self._truncate(lesson.lesson_summary, 160)
        takeaway = next(
            (
                item
                for item in [
                    *(lesson.recommendations or []),
                    *(lesson.mistakes or []),
                    *(lesson.successes or []),
                ]
                if item
            ),
            None,
        )
        takeaway_text = (
            f" | takeaway: {self._truncate(takeaway, 80)}" if takeaway else ""
        )
        return (
            f"- **{lesson.symbol} {lesson.side}** | outcome: {lesson.outcome}"
            f" | pnl: {lesson.profit_pct:.2f}% | age: {self._format_age(lesson.created_at)}"
            f"{takeaway_text}: {summary}"
        )

    def _format_pattern_context(self, pattern: TradingPattern) -> str:
        desc = self._truncate(pattern.description, 160)
        metadata = [
            self._format_metric("success", pattern.success_rate, suffix="%"),
            self._format_metric("samples", pattern.sample_count),
            self._format_list("symbols", pattern.symbols),
            self._format_list("timeframes", pattern.timeframes),
            (
                f"validated: {self._format_age(pattern.last_validated)}"
                if pattern.last_validated
                else None
            ),
        ]
        metadata_text = " | ".join(part for part in metadata if part)
        if metadata_text:
            return f"- **{pattern.pattern_name}** ({pattern.pattern_type}) | {metadata_text}: {desc}"
        return f"- **{pattern.pattern_name}** ({pattern.pattern_type}): {desc}"

    @staticmethod
    def _format_metric(
        label: str,
        value: float | int | None,
        *,
        suffix: str = "",
    ) -> str | None:
        if value is None:
            return None
        if isinstance(value, float):
            return f"{label}: {value:.2f}{suffix}"
        return f"{label}: {value}{suffix}"

    @staticmethod
    def _format_list(label: str, values: list[str] | None) -> str | None:
        if not values:
            return None
        return f"{label}: {', '.join(values[:3])}"

    @staticmethod
    def _format_dict_summary(label: str, values: dict | None) -> str | None:
        if not values:
            return None
        items: list[str] = []
        for key, value in values.items():
            if isinstance(value, (str, int, float, bool)):
                items.append(f"{key}={value}")
            if len(items) == 2:
                break
        if not items:
            return None
        return f"{label}: {', '.join(items)}"

    @staticmethod
    def _truncate(value: str | None, limit: int) -> str:
        if not value:
            return "No description"
        if len(value) <= limit:
            return value
        return value[: limit - 3].rstrip() + "..."

    @staticmethod
    def _format_age(timestamp: datetime | None) -> str:
        if timestamp is None:
            return "unknown"
        age_days = max(int((datetime.now(UTC) - timestamp).total_seconds() // 86400), 0)
        if age_days == 0:
            return "today"
        if age_days == 1:
            return "1 day ago"
        if age_days < 30:
            return f"{age_days} days ago"
        months = age_days // 30
        if months == 1:
            return "1 month ago"
        return f"{months} months ago"


# ── Singleton instance ──

_retriever: KnowledgeRetriever | None = None


def get_retriever() -> KnowledgeRetriever:
    """Get the singleton KnowledgeRetriever instance."""
    global _retriever
    if _retriever is None:
        _retriever = KnowledgeRetriever()
    return _retriever
