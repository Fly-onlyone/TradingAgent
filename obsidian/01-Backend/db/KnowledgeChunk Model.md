---
tags: [backend, db, model, rag]
---

# KnowledgeChunk Model

> A 200-word slice of a larger parent document (article, strategy) with its own embedding for fine-grained RAG retrieval.

## Source

- `backend/app/db/models/knowledge.py` — `KnowledgeChunk`
- Collection: `knowledge_chunks`

## Key fields

- `parent_id`, `parent_collection` (e.g. `"news_articles"`, `"strategy_knowledge"`)
- `chunk_index`, `total_chunks`
- `text`, `embedding: list[float]`

## Used by

- `chunker.py` writer
- [[RAG Retrieval Pipeline]] — chunk-level retrieval for long documents

## Special features

- Compound index `(parent_id, chunk_index)` for ordered reassembly
- Chunks are 200 words with 50-word overlap

## See also

- [[_index]]
- [[NewsArticle Model]]
- [[StrategyKnowledge Model]]
