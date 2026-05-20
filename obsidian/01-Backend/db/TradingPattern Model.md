---
tags: [backend, db, model, rag]
---

# TradingPattern Model

> Recognised pattern (technical / sentiment / correlation) mined from history, with success metrics and an embedding for RAG.

## Source

- `backend/app/db/models/knowledge.py` — `TradingPattern`
- Collection: `trading_patterns`

## Key fields

- `pattern_name` (indexed), `pattern_type` (`technical`/`sentiment`/`correlation`), `description`
- `conditions: dict`
- `success_rate`, `sample_count`, `avg_return`, `avg_duration_hours`
- Applicability: `symbols`, `timeframes`, `market_conditions`
- `context_prefix`, `embedding` (768-dim)
- `last_validated`

## Used by

- Pattern mining service (scheduled crawl)
- [[RAG Retrieval Pipeline]]
- [[Knowledge Graph Edges]] — `DETECTED_IN`, `SUPPORTS`

## Special features

- Compound index `(pattern_type, success_rate DESC)` for top-K filtering
- TEXT index over `(pattern_name, description)`

## See also

- [[_index]]
- [[StrategyKnowledge Model]]
