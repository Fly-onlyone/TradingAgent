"""Knowledge retriever for RAG-based strategy and lesson search using MongoDB."""

import sentry_sdk

from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.db.models.news import NewsArticle
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
    ) -> list[StrategyKnowledge]:
        """Search for strategies similar to the query.

        Args:
            query: Natural language query
            limit: Maximum number of results
            min_similarity: Minimum cosine similarity threshold
            query_embedding: Pre-computed query embedding (avoids redundant API calls)
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return []

        strategies = await StrategyKnowledge.find(
            {"embedding": {"$exists": True, "$ne": None}}
        ).to_list()

        scored = []
        for strategy in strategies:
            if strategy.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, strategy.embedding
                )
                if similarity >= min_similarity:
                    scored.append((strategy, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)

        return [s[0] for s in scored[:limit]]

    async def search_lessons(
        self,
        query: str,
        symbol: str | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[TradeLesson]:
        """Search for trade lessons similar to the query.

        Args:
            query: Natural language query
            symbol: Optional symbol filter
            limit: Maximum number of results
            min_similarity: Minimum cosine similarity threshold
            query_embedding: Pre-computed query embedding (avoids redundant API calls)
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return []

        filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
        if symbol:
            filter_query["symbol"] = symbol.upper()

        lessons = await TradeLesson.find(filter_query).to_list()

        scored = []
        for lesson in lessons:
            if lesson.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, lesson.embedding
                )
                if similarity >= min_similarity:
                    scored.append((lesson, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)

        return [item[0] for item in scored[:limit]]

    async def search_patterns(
        self,
        query: str,
        pattern_type: str | None = None,
        min_success_rate: float | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[TradingPattern]:
        """Search for trading patterns similar to the query.

        Args:
            query: Natural language query
            pattern_type: Filter by pattern type
            min_success_rate: Minimum success rate threshold
            limit: Maximum number of results
            min_similarity: Minimum cosine similarity threshold
            query_embedding: Pre-computed query embedding (avoids redundant API calls)
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return []

        filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
        if pattern_type:
            filter_query["pattern_type"] = pattern_type
        if min_success_rate is not None:
            filter_query["success_rate"] = {"$gte": min_success_rate}

        patterns = await TradingPattern.find(filter_query).to_list()

        scored = []
        for pattern in patterns:
            if pattern.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, pattern.embedding
                )
                if similarity >= min_similarity:
                    scored.append((pattern, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)

        return [p[0] for p in scored[:limit]]

    async def search_news(
        self,
        query: str,
        assets: list[str] | None = None,
        limit: int = 5,
        min_similarity: float = 0.6,
        query_embedding: list[float] | None = None,
    ) -> list[NewsArticle]:
        """Semantic search over news articles using stored embeddings.

        Falls back to regex if embedding search yields no results.
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return []

        filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
        if assets:
            normalized = [a.upper().replace("-USDT", "") for a in assets]
            filter_query["mentioned_assets"] = {"$in": normalized}

        articles = await NewsArticle.find(filter_query).to_list()

        scored = []
        for article in articles:
            if article.embedding:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding, article.embedding
                )
                if similarity >= min_similarity:
                    scored.append((article, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [a[0] for a in scored[:limit]]

    async def search_all(
        self,
        query: str,
        limit_per_type: int = 3,
        min_similarity: float = 0.6,
    ) -> dict[str, list]:
        """Search across all knowledge types including news.

        Generates the query embedding once and reuses it for all four searches.
        """
        query_embedding = await self.embedding_service.generate_query_embedding(query)
        if query_embedding is None:
            return {"strategies": [], "lessons": [], "patterns": [], "news": []}

        strategies = await self.search_strategies(
            query, limit_per_type, min_similarity, query_embedding=query_embedding
        )
        lessons = await self.search_lessons(
            query,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
        )
        patterns = await self.search_patterns(
            query,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
        )
        news = await self.search_news(
            query,
            limit=limit_per_type,
            min_similarity=min_similarity,
            query_embedding=query_embedding,
        )

        return {
            "strategies": strategies,
            "lessons": lessons,
            "patterns": patterns,
            "news": news,
        }

    async def get_relevant_context(
        self,
        query: str,
        max_results: int = 6,
    ) -> str:
        """Get relevant knowledge formatted as context for the agent."""
        with sentry_sdk.start_span(
            op="rag.context_assembly", description="rag.get_relevant_context"
        ):
            results = await self.search_all(
                query, limit_per_type=max_results // 3, min_similarity=0.5
            )

            context_parts = []

            if results["strategies"]:
                context_parts.append("## Relevant Strategies")
                for strategy in results["strategies"]:
                    desc = strategy.description[:200] if strategy.description else "No description"
                    context_parts.append(f"- **{strategy.name}**: {desc}")

            if results["lessons"]:
                context_parts.append("\n## Relevant Trade Lessons")
                for lesson in results["lessons"]:
                    summary = lesson.lesson_summary[:200] if lesson.lesson_summary else "No summary"
                    context_parts.append(
                        f"- **{lesson.symbol} {lesson.side}** ({lesson.outcome}, {lesson.profit_pct}%): {summary}"
                    )

            if results["patterns"]:
                context_parts.append("\n## Relevant Patterns")
                for pattern in results["patterns"]:
                    desc = pattern.description[:200] if pattern.description else "No description"
                    context_parts.append(
                        f"- **{pattern.pattern_name}** ({pattern.pattern_type}, "
                        f"success: {pattern.success_rate}%): {desc}"
                    )

            if results.get("news"):
                context_parts.append("\n## Relevant News")
                for article in results["news"]:
                    title = article.title[:120] if article.title else "Untitled"
                    sentiment = (
                        f", sentiment: {article.sentiment_score:+.2f}"
                        if article.sentiment_score is not None
                        else ""
                    )
                    assets = (
                        f" [{', '.join(article.mentioned_assets)}]"
                        if article.mentioned_assets
                        else ""
                    )
                    context_parts.append(f"- **{title}**{assets}{sentiment}")

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
        return await query.sort(-TradeLesson.created_at).limit(limit).to_list()

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
            .sort(-TradingPattern.success_rate)
            .limit(limit)
            .to_list()
        )


# ── Singleton instance ──

_retriever: KnowledgeRetriever | None = None


def get_retriever() -> KnowledgeRetriever:
    """Get the singleton KnowledgeRetriever instance."""
    global _retriever
    if _retriever is None:
        _retriever = KnowledgeRetriever()
    return _retriever
