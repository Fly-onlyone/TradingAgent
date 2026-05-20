---
tags: [backend, knowledge]
---

# FlashRank Reranker

> Lightweight cross-encoder re-ranking pass over the fused top-N, gated by an
> `AppSettings` flag.

## Source

- `backend/app/knowledge/reranker.py`

## How it works

`_get_reranker()` lazily constructs a singleton `flashrank.Ranker` using
`ms-marco-MiniLM-L-12-v2` cached under `.flashrank/`. The retriever calls
`rerank(query, results, text_fn, limit)` only when
`AppSettings.reranking_enabled` is true (checked via `_cached_instance` so
the hot path stays sync). For each candidate, `text_fn(doc)` extracts the
strings to score — typically `name + description` for strategies,
`symbol side outcome lesson_summary` for lessons, `title + summary` for news.
Returned scores replace the upstream RRF score in the `(doc, score)` tuple.
Exceptions are swallowed and the function falls back to the original order.

## Depends on

- `flashrank` (cross-encoder).
- [[App Settings]] (`reranking_enabled` flag).

## Used by

- [[Hybrid Retriever]] (`_maybe_rerank` after [[Reciprocal Rank Fusion]])

## Gotchas

- Skipped automatically when `len(results) <= 1` — no overhead for trivial sets.
- Model files download on first use; warm via a smoke search if cold-start latency matters.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
