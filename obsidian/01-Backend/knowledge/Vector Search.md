---
tags: [backend, knowledge]
---

# Vector Search

> NumPy-vectorised cosine similarity over a projection-only Motor query — scores
> all candidate docs at once, then fetches full bodies for top-k.

## Source

- `backend/app/knowledge/retriever.py` (`_vectorized_search`)

## How it works

Three-phase pipeline:

1. **Projection load** — `get_pymongo_collection().find(filter, {"_id": 1, "embedding": 1, ...})`
   pulls only ids + embeddings (plus `created_at`/`published_at` when time decay is enabled).
   This avoids transferring full document content over the wire for collections that may
   hold thousands of articles.
2. **Vectorised scoring** — embeddings stack into a `(n, 768)` NumPy float32 matrix;
   cosine similarity is a single `matrix @ query_vec` since vectors are L2-normalised
   on encode. Scores are clipped to `[-1, 1]`, then multiplied by the per-collection
   time-decay weight (see [[Time Decay Weighting]]).
3. **Top-k fetch** — `np.argsort` picks indices above `min_similarity`, then a single
   `find({"_id": {"$in": top_ids}})` hydrates full Beanie documents while preserving
   score order.

## Depends on

- [[Local Embeddings]]
- [[Time Decay Weighting]]

## Used by

- [[Hybrid Retriever]] (all four `search_*` methods)

## Gotchas

- Documents without an `embedding` field are silently skipped — make sure backfills run.
- Float32 throughout — no float64 conversions; matches sentence-transformers default.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
- [[Reciprocal Rank Fusion]]
