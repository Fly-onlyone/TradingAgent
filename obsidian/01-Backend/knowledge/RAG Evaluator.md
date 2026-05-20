---
tags: [backend, knowledge]
---

# RAG Evaluator

> Stateless retrieval metrics — Precision@k, Recall@k, MRR, NDCG@k — for
> grading the RAG pipeline against a labelled gold set.

## Source

- `backend/app/knowledge/evaluator.py`

## How it works

Four pure functions operate on a `relevant_ids: set[str]` ground truth and a
`retrieved_ids: list[str]` ranked output:

- `precision_at_k` — hits in top-k / k
- `recall_at_k` — hits in top-k / total relevant
- `mrr` — `1 / rank_of_first_hit` (Mean Reciprocal Rank)
- `ndcg_at_k` — DCG / IDCG using `log2(i + 2)` discounting

`evaluate_retrieval()` returns all four for a single query; `evaluate_batch()`
averages them across a list of `{"relevant_ids", "retrieved_ids"}` dicts.
Used by `tests/test_rag_evaluation.py` to gate retrieval quality regressions
when swapping models or tweaking [[Reciprocal Rank Fusion]] / [[Time Decay Weighting]].

## Used by

- `tests/test_rag_evaluation.py`
- Offline tuning notebooks / admin evaluation endpoints

## See also

- [[_index]]
- [[Hybrid Retriever]]
- [[RAG Retrieval Pipeline]]
