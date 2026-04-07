"""Knowledge retriever for RAG-based strategy and lesson search using MongoDB."""

import logging
import math
import re
from datetime import UTC, datetime
from typing import Any, TypeVar

import numpy as np
import sentry_sdk
from beanie import Document

from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.db.models.news import NewsArticle
from app.knowledge.embeddings import EmbeddingService, get_embedding_service
from app.knowledge.fusion import rrf_merge

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=Document)

# Time-decay parameters per collection: (decay_rate, alpha)
# decay_rate controls how fast relevance decays; alpha is the minimum weight floor.
_TIME_DECAY_PARAMS: dict[str, tuple[float, float]] = {
    "news_articles": (math.log(2) / 24, 0.3),
    "trade_lessons": (math.log(2) / (7 * 24), 0.5),
    "strategy_knowledge": (math.log(2) / (30 * 24), 0.7),
    "trading_patterns": (math.log(2) / (30 * 24), 0.7),
}


def normalize_assets(assets: list[str]) -> list[str]:
    """Normalize asset symbols by uppercasing and stripping -USDT suffix."""
    return [a.upper().replace("-USDT", "") for a in assets]


async def _vectorized_search(
    doc_class: type[T],
    filter_query: dict[str, Any],
    query_embedding: list[float],
    min_similarity: float,
    limit: int,
) -> list[tuple[T, float]]:
    """Vectorized similarity search using NumPy matrix ops and MongoDB projection.

    Loads only _id + embedding for scoring, then fetches full documents
    for the top-k results. Applies time-decay weighting so recent documents
    score higher than stale ones (per-collection half-life config).
    """
    # Resolve collection name for time-decay lookup
    collection_name = getattr(
        getattr(doc_class, "Settings", None), "name", doc_class.__name__.lower()
    )
    decay_params = _TIME_DECAY_PARAMS.get(collection_name)

    # Phase 1: Load only IDs, embeddings, and timestamp via Motor projection
    # (avoids transferring full document content over the wire)
    projection: dict[str, int] = {"_id": 1, "embedding": 1}
    if decay_params:
        projection["created_at"] = 1
        projection["published_at"] = 1

    collection = doc_class.get_pymongo_collection()
    cursor = collection.find(filter_query, projection)
    raw_docs = await cursor.to_list(length=None)

    if not raw_docs:
        return []

    # Build parallel arrays: ids, embedding matrix, and timestamps
    ids = []
    rows = []
    timestamps: list[datetime] = []
    now = datetime.now(UTC)
    for doc in raw_docs:
        emb = doc.get("embedding")
        if emb:
            ids.append(doc["_id"])
            rows.append(emb)
            created = doc.get("created_at") or doc.get("published_at") or now
            timestamps.append(created)

    if not rows:
        return []

    # Phase 2: Vectorized cosine similarity (dot product of L2-normalized vecs)
    embedding_matrix = np.array(rows, dtype=np.float32)
    query_vec = np.array(query_embedding, dtype=np.float32)
    scores = embedding_matrix @ query_vec  # shape: (n,)
    np.clip(scores, -1.0, 1.0, out=scores)

    # Apply time-decay weighting: score * (alpha + (1 - alpha) * exp(-decay * age_h))
    if decay_params:
        decay_rate, alpha = decay_params
        age_hours = np.array(
            [(now - ts).total_seconds() / 3600 for ts in timestamps], dtype=np.float32
        )
        time_weights = np.exp(-decay_rate * age_hours)
        scores = scores * (alpha + (1 - alpha) * time_weights)

    # Filter by threshold and get top-k indices
    mask = scores >= min_similarity
    if not mask.any():
        return []

    valid_indices = np.flatnonzero(mask)
    valid_scores = scores[valid_indices]
    # argsort descending, take top limit
    top_order = np.argsort(valid_scores)[::-1][:limit]
    top_indices = valid_indices[top_order]
    top_scores = scores[top_indices]
    top_ids = [ids[i] for i in top_indices]

    # Phase 3: Fetch full documents for top-k only
    full_docs = await doc_class.find({"_id": {"$in": top_ids}}).to_list()
    doc_map = {d.id: d for d in full_docs}

    # Preserve score ordering
    results: list[tuple[T, float]] = []
    for doc_id, score in zip(top_ids, top_scores):
        if doc_id in doc_map:
            results.append((doc_map[doc_id], float(score)))

    return results


async def _text_search(
    doc_class: type[T],
    query: str,
    extra_filter: dict[str, Any] | None = None,
    limit: int = 10,
) -> list[T]:
    """Run MongoDB text search on a collection's text index.

    Returns documents ranked by MongoDB's text score.
    Silently returns [] if the collection has no text index.
    """
    try:
        text_filter: dict[str, Any] = {"$text": {"$search": query}}
        if extra_filter:
            text_filter.update(extra_filter)

        collection = doc_class.get_pymongo_collection()
        cursor = (
            collection.find(text_filter, {"score": {"$meta": "textScore"}})
            .sort([("score", {"$meta": "textScore"})])
            .limit(limit)
        )
        raw_docs = await cursor.to_list(length=limit)

        if not raw_docs:
            return []

        # Fetch full Beanie documents by IDs (to get proper model instances)
        doc_ids = [d["_id"] for d in raw_docs]
        full_docs = await doc_class.find({"_id": {"$in": doc_ids}}).to_list()
        # Preserve text-score ordering
        doc_map = {d.id: d for d in full_docs}
        return [doc_map[did] for did in doc_ids if did in doc_map]
    except Exception:
        # No text index or other error — fall through gracefully
        return []


class KnowledgeRetriever:
    """RAG retriever for finding relevant trading knowledge."""

    def __init__(self) -> None:
        self.embedding_service: EmbeddingService = get_embedding_service()

    async def _maybe_rerank(
        self,
        query: str,
        results: list[tuple[T, float]],
        text_fn: Any,
        limit: int,
    ) -> list[tuple[T, float]]:
        """Apply cross-encoder re-ranking if enabled in settings."""
        if not results or len(results) <= 1:
            return results

        try:
            from app.db.models.app_settings import AppSettings

            settings = AppSettings._cached_instance
            if not (settings and settings.reranking_enabled):
                return results[:limit]
        except Exception:
            return results[:limit]

        from app.knowledge.reranker import rerank

        return rerank(query, results, text_fn, limit)

    async def search_strategies(
        self,
        query: str,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[tuple[StrategyKnowledge, float]]:
        """Search for strategies similar to the query.

        Returns (document, score) tuples sorted by similarity.
        Uses embedding similarity first, falls back to regex on name/description.
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)

        if query_embedding is not None:
            vector_results = await _vectorized_search(
                StrategyKnowledge,
                {"embedding": {"$exists": True, "$ne": None}},
                query_embedding,
                min_similarity,
                limit * 4,
            )
            # Hybrid: run text search in parallel and merge via RRF
            text_results = await _text_search(StrategyKnowledge, query, limit=limit * 2)
            if vector_results or text_results:
                merged = rrf_merge(vector_results, text_results, limit * 4)
                return await self._maybe_rerank(
                    query, merged, lambda s: f"{s.name} {s.description or ''}", limit
                )

        # Fallback: regex on name/description (score=0.0 since no embedding match)
        logger.debug("Strategy embedding search yielded no results, falling back to regex")
        pattern = re.escape(query)
        docs = (
            await StrategyKnowledge.find(
                {
                    "$or": [
                        {"name": {"$regex": pattern, "$options": "i"}},
                        {"description": {"$regex": pattern, "$options": "i"}},
                    ]
                }
            )
            .limit(limit)
            .to_list()
        )
        return [(d, 0.0) for d in docs]

    async def search_lessons(
        self,
        query: str,
        symbol: str | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[tuple[TradeLesson, float]]:
        """Search for trade lessons similar to the query.

        Returns (document, score) tuples sorted by similarity.
        Uses embedding similarity first, falls back to recent lessons by symbol.
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)

        if query_embedding is not None:
            filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
            if symbol:
                filter_query["symbol"] = symbol.upper()

            vector_results = await _vectorized_search(
                TradeLesson, filter_query, query_embedding, min_similarity, limit * 4
            )
            text_filter = {"symbol": symbol.upper()} if symbol else None
            text_results = await _text_search(TradeLesson, query, text_filter, limit * 2)
            if vector_results or text_results:
                merged = rrf_merge(vector_results, text_results, limit * 4)
                return await self._maybe_rerank(
                    query,
                    merged,
                    lambda ls: f"{ls.symbol} {ls.side} {ls.outcome} {ls.lesson_summary or ''}",
                    limit,
                )

        # Fallback: recent lessons, optionally filtered by symbol
        logger.debug("Lesson embedding search yielded no results, falling back to recent")
        fallback_filter = {}
        if symbol:
            fallback_filter["symbol"] = symbol.upper()
        docs = (
            await TradeLesson.find(fallback_filter)
            .sort(-TradeLesson.created_at)
            .limit(limit)
            .to_list()
        )
        return [(d, 0.0) for d in docs]

    async def search_patterns(
        self,
        query: str,
        pattern_type: str | None = None,
        min_success_rate: float | None = None,
        limit: int = 5,
        min_similarity: float = 0.7,
        query_embedding: list[float] | None = None,
    ) -> list[tuple[TradingPattern, float]]:
        """Search for trading patterns similar to the query.

        Returns (document, score) tuples sorted by similarity.
        Uses embedding similarity first, falls back to filter-based query.
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)

        if query_embedding is not None:
            filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
            if pattern_type:
                filter_query["pattern_type"] = pattern_type
            if min_success_rate is not None:
                filter_query["success_rate"] = {"$gte": min_success_rate}

            vector_results = await _vectorized_search(
                TradingPattern, filter_query, query_embedding, min_similarity, limit * 4
            )
            text_filter_extra: dict[str, Any] = {}
            if pattern_type:
                text_filter_extra["pattern_type"] = pattern_type
            text_results = await _text_search(
                TradingPattern, query, text_filter_extra or None, limit * 2
            )
            if vector_results or text_results:
                merged = rrf_merge(vector_results, text_results, limit * 4)
                return await self._maybe_rerank(
                    query,
                    merged,
                    lambda p: f"{p.pattern_name} {p.pattern_type} {p.description or ''}",
                    limit,
                )

        # Fallback: filter-based query without embedding
        logger.debug("Pattern embedding search yielded no results, falling back to filters")
        fallback_filter: dict = {}
        if pattern_type:
            fallback_filter["pattern_type"] = pattern_type
        if min_success_rate is not None:
            fallback_filter["success_rate"] = {"$gte": min_success_rate}
        docs = (
            await TradingPattern.find(fallback_filter)
            .sort(-TradingPattern.success_rate)
            .limit(limit)
            .to_list()
        )
        return [(d, 0.0) for d in docs]

    async def search_news(
        self,
        query: str,
        assets: list[str] | None = None,
        limit: int = 5,
        min_similarity: float = 0.6,
        query_embedding: list[float] | None = None,
    ) -> list[tuple[NewsArticle, float]]:
        """Semantic search over news articles.

        Returns (document, score) tuples sorted by similarity.
        Uses embedding similarity first, falls back to regex on title/content/summary.
        """
        if query_embedding is None:
            query_embedding = await self.embedding_service.generate_query_embedding(query)

        if query_embedding is not None:
            filter_query: dict = {"embedding": {"$exists": True, "$ne": None}}
            if assets:
                filter_query["mentioned_assets"] = {"$in": normalize_assets(assets)}

            vector_results = await _vectorized_search(
                NewsArticle, filter_query, query_embedding, min_similarity, limit * 4
            )
            text_extra = {"mentioned_assets": {"$in": normalize_assets(assets)}} if assets else None
            text_results = await _text_search(NewsArticle, query, text_extra, limit * 2)
            if vector_results or text_results:
                merged = rrf_merge(vector_results, text_results, limit * 4)
                return await self._maybe_rerank(
                    query,
                    merged,
                    lambda a: f"{a.title or ''} {a.summary or a.content[:500] if a.content else ''}",
                    limit,
                )

        # Fallback: regex on title/content/summary
        logger.debug("News embedding search yielded no results, falling back to regex")
        pattern = re.escape(query)
        search_filter: dict = {
            "$or": [
                {"title": {"$regex": pattern, "$options": "i"}},
                {"content": {"$regex": pattern, "$options": "i"}},
                {"summary": {"$regex": pattern, "$options": "i"}},
            ]
        }
        if assets:
            search_filter["mentioned_assets"] = {"$in": normalize_assets(assets)}
        docs = (
            await NewsArticle.find(search_filter)
            .sort(-NewsArticle.published_at)
            .limit(limit)
            .to_list()
        )
        return [(d, 0.0) for d in docs]

    async def search_all(
        self,
        query: str,
        limit_per_type: int = 3,
        min_similarity: float = 0.6,
    ) -> dict[str, list]:
        """Search across all knowledge types including news.

        Generates the query embedding once and reuses it for all four searches.
        Returns scored results per type.
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
                for strategy, score in results["strategies"]:
                    desc = strategy.description[:200] if strategy.description else "No description"
                    context_parts.append(f"- **{strategy.name}** (relevance: {score:.2f}): {desc}")

            if results["lessons"]:
                context_parts.append("\n## Relevant Trade Lessons")
                for lesson, score in results["lessons"]:
                    summary = lesson.lesson_summary[:200] if lesson.lesson_summary else "No summary"
                    context_parts.append(
                        f"- **{lesson.symbol} {lesson.side}** ({lesson.outcome}, "
                        f"{lesson.profit_pct}%, relevance: {score:.2f}): {summary}"
                    )

            if results["patterns"]:
                context_parts.append("\n## Relevant Patterns")
                for pattern, score in results["patterns"]:
                    desc = pattern.description[:200] if pattern.description else "No description"
                    context_parts.append(
                        f"- **{pattern.pattern_name}** ({pattern.pattern_type}, "
                        f"success: {pattern.success_rate}%, relevance: {score:.2f}): {desc}"
                    )

            if results.get("news"):
                context_parts.append("\n## Relevant News")
                for article, score in results["news"]:
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
                    context_parts.append(
                        f"- **{title}**{assets}{sentiment} (relevance: {score:.2f})"
                    )

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
