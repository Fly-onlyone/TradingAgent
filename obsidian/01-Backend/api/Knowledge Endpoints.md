---
tags: [backend, api, rag, knowledge]
---

# Knowledge Endpoints

> RAG-side CRUD for [[StrategyKnowledge Model]], [[TradeLesson Model]], [[TradingPattern Model]] plus the unified `/search` endpoint under `/knowledge`.

## Source

- `backend/app/api/v1/knowledge.py`

## How it works

Three model families share this router. POST endpoints insert the document, then generate the embedding via the matching `*EmbeddingGenerator` (Strategy / TradeLesson / TradingPattern) and save again. `POST /knowledge/search` is the user-facing search entry point — it delegates to `get_retriever()` which runs the [[RAG Retrieval Pipeline]] (hybrid vector+text → RRF fusion → time decay → optional FlashRank rerank).

## Endpoints

- `POST/GET /knowledge/strategies` — list/create `StrategyKnowledge`
- `GET /knowledge/strategies/{id}`
- `POST/GET /knowledge/lessons` — list/create `TradeLesson`
- `GET /knowledge/lessons/{id}`
- `POST/GET /knowledge/patterns` — list/create `TradingPattern`
- `GET /knowledge/patterns/{id}`
- `POST /knowledge/search` — unified hybrid search across all three

## Depends on

- [[StrategyKnowledge Model]]
- [[TradeLesson Model]]
- [[TradingPattern Model]]
- [[RAG Retrieval Pipeline]]

## See also

- [[_index]]
- [[Knowledge Graph Edges]]
