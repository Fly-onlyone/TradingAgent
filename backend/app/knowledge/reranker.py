"""Lightweight cross-encoder re-ranking via FlashRank."""

import logging
import threading
from collections.abc import Callable
from typing import Any, TypeVar

from beanie import Document

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=Document)

_reranker: Any = None
_reranker_lock = threading.Lock()


def _get_reranker() -> Any:
    """Lazy-load the FlashRank Ranker singleton."""
    global _reranker
    if _reranker is None:
        with _reranker_lock:
            if _reranker is None:
                from flashrank import Ranker

                _reranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir=".flashrank")
                logger.info("FlashRank re-ranker loaded")
    return _reranker


def rerank(
    query: str,
    results: list[tuple[T, float]],
    text_fn: Callable[[T], str],
    limit: int = 5,
) -> list[tuple[T, float]]:
    """Re-rank results using FlashRank cross-encoder.

    Args:
        query: The search query.
        results: List of (document, vector_score) tuples.
        text_fn: Function to extract text from a document for re-ranking.
        limit: Number of results to return after re-ranking.
    """
    if not results or len(results) <= 1:
        return results[:limit]

    try:
        from flashrank import RerankRequest

        ranker = _get_reranker()

        # Build passages for FlashRank
        passages = [{"id": i, "text": text_fn(doc)} for i, (doc, _) in enumerate(results)]
        request = RerankRequest(query=query, passages=passages)
        ranked = ranker.rerank(request)

        # Map back to original (doc, new_score) tuples
        reranked: list[tuple[T, float]] = []
        for item in ranked[:limit]:
            idx = item["id"]
            new_score = item["score"]
            doc, _old_score = results[idx]
            reranked.append((doc, float(new_score)))

        return reranked
    except Exception:
        logger.warning("Re-ranking failed, returning original order", exc_info=True)
        return results[:limit]
