---
tags: [backend, knowledge]
---

# Hybrid Retriever

> The RAG orchestrator: parallel vector + text search, RRF merge, time decay,
> optional rerank — one method per knowledge type, all returning scored tuples.

## Source

- `backend/app/knowledge/retriever.py` (`KnowledgeRetriever`)

## How it works

For each search method (`search_strategies`, `search_lessons`, `search_patterns`,
`search_news`) the retriever:

1. Calls `generate_query_embedding()` (cached via [[Embedding Cache]]).
2. Runs [[Vector Search]] (`_vectorized_search`) and [[Text Search]] (`_text_search`)
   against the collection.
3. Merges both rankings via `rrf_merge()` — see [[Reciprocal Rank Fusion]].
4. Applies [[Time Decay Weighting]] inside the vector phase (per-collection half-life).
5. Optionally pipes the merged list through [[FlashRank Reranker]] when
   `AppSettings.reranking_enabled` is true.
6. Returns `list[tuple[Document, float]]` — every consumer MUST unpack.

`search_all()` generates the query embedding once and fans out to all four
type-specific searches in parallel. `get_relevant_context()` formats the
results as Markdown for the agent's system prompt. Fallbacks (regex on
name/description, recent-by-symbol) kick in only when the embedding pipeline
yields nothing.

## Depends on

- [[Local Embeddings]] · [[Vector Search]] · [[Text Search]]
- [[Reciprocal Rank Fusion]] · [[Time Decay Weighting]] · [[FlashRank Reranker]]

## Used by

- [[Knowledge Tools]] · [[News Tools]]
- Agent context-assembly endpoints

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
