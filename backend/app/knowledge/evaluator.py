"""RAG evaluation metrics: Precision@k, Recall@k, MRR, NDCG@k."""

import math


def precision_at_k(relevant_ids: set[str], retrieved_ids: list[str], k: int = 5) -> float:
    """Fraction of top-k retrieved documents that are relevant."""
    top_k = retrieved_ids[:k]
    if not top_k:
        return 0.0
    hits = sum(1 for did in top_k if did in relevant_ids)
    return hits / len(top_k)


def recall_at_k(relevant_ids: set[str], retrieved_ids: list[str], k: int = 5) -> float:
    """Fraction of relevant documents found in top-k."""
    if not relevant_ids:
        return 0.0
    top_k = retrieved_ids[:k]
    hits = sum(1 for did in top_k if did in relevant_ids)
    return hits / len(relevant_ids)


def mrr(relevant_ids: set[str], retrieved_ids: list[str]) -> float:
    """Mean Reciprocal Rank -- 1/rank of the first relevant document."""
    for i, did in enumerate(retrieved_ids):
        if did in relevant_ids:
            return 1.0 / (i + 1)
    return 0.0


def ndcg_at_k(relevant_ids: set[str], retrieved_ids: list[str], k: int = 5) -> float:
    """Normalized Discounted Cumulative Gain at k."""
    top_k = retrieved_ids[:k]
    dcg = 0.0
    for i, did in enumerate(top_k):
        if did in relevant_ids:
            dcg += 1.0 / math.log2(i + 2)  # i+2 because log2(1) = 0

    # Ideal DCG: all relevant docs at the top
    ideal_count = min(len(relevant_ids), k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_count))
    if idcg == 0:
        return 0.0
    return dcg / idcg


def evaluate_retrieval(
    relevant_ids: set[str],
    retrieved_ids: list[str],
    k: int = 5,
) -> dict[str, float]:
    """Compute all retrieval metrics for a single query."""
    return {
        "precision_at_k": precision_at_k(relevant_ids, retrieved_ids, k),
        "recall_at_k": recall_at_k(relevant_ids, retrieved_ids, k),
        "mrr": mrr(relevant_ids, retrieved_ids),
        "ndcg_at_k": ndcg_at_k(relevant_ids, retrieved_ids, k),
    }


def evaluate_batch(
    queries: list[dict],
    k: int = 5,
) -> dict[str, float]:
    """Compute averaged metrics over a batch of queries.

    Each query dict should have:
        - "relevant_ids": set[str] -- IDs of relevant documents
        - "retrieved_ids": list[str] -- IDs of retrieved documents (in order)
    """
    if not queries:
        return {"precision_at_k": 0.0, "recall_at_k": 0.0, "mrr": 0.0, "ndcg_at_k": 0.0}

    totals: dict[str, float] = {
        "precision_at_k": 0.0,
        "recall_at_k": 0.0,
        "mrr": 0.0,
        "ndcg_at_k": 0.0,
    }
    for q in queries:
        metrics = evaluate_retrieval(q["relevant_ids"], q["retrieved_ids"], k)
        for key in totals:
            totals[key] += metrics[key]

    return {key: val / len(queries) for key, val in totals.items()}
