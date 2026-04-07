"""Reciprocal Rank Fusion (RRF) for merging vector and text search results."""

from typing import TypeVar

from beanie import Document

T = TypeVar("T", bound=Document)

# RRF constant — higher values reduce the impact of rank differences
_RRF_K = 60


def rrf_merge(
    vector_results: list[tuple[T, float]],
    text_results: list[T],
    limit: int,
) -> list[tuple[T, float]]:
    """Merge vector search (scored) and text search (unscored) results via RRF.

    Vector results carry similarity scores; text results are ranked by MongoDB's
    text score ordering. The RRF formula: score(d) = sum(1 / (k + rank_i + 1))
    across all result lists where d appears.
    """
    # Build score map: doc_id -> (doc, rrf_score)
    score_map: dict[str, tuple[T, float]] = {}

    for rank, (doc, _vec_score) in enumerate(vector_results):
        doc_id = str(doc.id)
        rrf_score = 1.0 / (_RRF_K + rank + 1)
        if doc_id in score_map:
            existing_doc, existing_score = score_map[doc_id]
            score_map[doc_id] = (existing_doc, existing_score + rrf_score)
        else:
            score_map[doc_id] = (doc, rrf_score)

    for rank, doc in enumerate(text_results):
        doc_id = str(doc.id)
        rrf_score = 1.0 / (_RRF_K + rank + 1)
        if doc_id in score_map:
            existing_doc, existing_score = score_map[doc_id]
            score_map[doc_id] = (existing_doc, existing_score + rrf_score)
        else:
            score_map[doc_id] = (doc, rrf_score)

    # Sort by RRF score descending
    merged = sorted(score_map.values(), key=lambda x: x[1], reverse=True)
    return merged[:limit]
