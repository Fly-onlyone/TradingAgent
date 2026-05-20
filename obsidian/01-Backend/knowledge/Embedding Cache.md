---
tags: [backend, knowledge]
---

# Embedding Cache

> Module-level dict caching query embeddings for 300s with a 64-entry LRU-style cap.

## Source

- `backend/app/knowledge/embeddings.py` (`_query_cache`, `generate_query_embedding`)

## How it works

`generate_query_embedding()` checks `_query_cache: dict[str, tuple[list[float], float]]`
keyed by the prefixed query text. Hits within `_QUERY_CACHE_TTL = 300s` return immediately
without touching the model. Expired entries are deleted on read. On insert, if size
hits `_QUERY_CACHE_MAX = 64`, the oldest entry (smallest timestamp) is evicted — a cheap
approximation of LRU using `min()` over the dict. Document embeddings are NOT cached
because they're typically generated once at write time. The cache lives in process
memory only — not shared across workers and not persisted.

## Depends on

- [[Local Embeddings]]

## Used by

- [[Hybrid Retriever]] (every `search_*` call calls `generate_query_embedding`)
- `search_all()` generates the embedding once and reuses it across all 4 searches

## Gotchas

- Cache key includes the model-specific prefix, so switching `embedding_model_name` naturally bypasses stale entries.
- Per-process state — multiple Uvicorn workers each maintain their own cache.

## See also

- [[_index]]
- [[Local Embeddings]]
- [[RAG Retrieval Pipeline]]
