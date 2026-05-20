---
tags: [integrations]
---

# FlashRank

> Lightweight cross-encoder reranking library — improves retrieval precision after the hybrid search step.

## Used for

- Re-ranking top candidates from [[Hybrid Retriever]] before returning to Claude
- Implemented in `backend/app/services/rag/reranker.py` ([[FlashRank Reranker]])
- Toggleable via `AppSettings.reranking_enabled`

## Configuration

- `flashrank>=0.2.0`
- Cross-encoder model loaded lazily on first use

## Gotchas

- Adds latency — disable when not needed
- First call downloads model weights

## See also

- [[_index]]
- [[FlashRank Reranker]]
- [[RAG Retrieval Pipeline]]
