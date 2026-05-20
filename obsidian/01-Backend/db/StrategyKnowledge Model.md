---
tags: [backend, db, model, rag]
---

# StrategyKnowledge Model

> RAG-indexed strategy entry with embedded vector, rating aggregates, provenance back to the source article/session, and extraction history.

## Source

- `backend/app/db/models/knowledge.py` — `StrategyKnowledge`
- Collection: `strategy_knowledge`

## Key fields

- `name`, `description`, `entry_rules`, `exit_rules`, `risk_params`
- Metrics: `backtest_results`, `win_rate`, `avg_return`, `max_drawdown`, `sharpe_ratio`
- Rating aggregates: `overall_rating`, `rating_confidence`, `rating_count`, `average_user_rating`
- Metadata: `market_conditions`, `asset_classes`, `timeframes`
- Provenance: `source_article_id`, `source_url`, `source_sentiment`, `source_session_id`
- `extraction_messages: list[dict]`
- `context_prefix` (Claude-generated) + `embedding: list[float]` (768-dim nomic)

## Used by

- [[RAG Retrieval Pipeline]] — vector + text hybrid search
- Strategy import flow + [[Strategy Auto-Discovery Cycle]]
- Edges in [[Knowledge Graph Edges]]

## Special features

- Inline embedding (no separate collection)
- MongoDB TEXT index on `(name, description)` for hybrid search

## See also

- [[_index]]
- [[Strategy Model]]
- [[Local Embeddings]]
