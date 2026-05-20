---
tags: [backend, db, model, rag]
---

# TradeLesson Model

> AI-generated lesson distilled from a closed trade, embedded for RAG retrieval and indexed by symbol + outcome.

## Source

- `backend/app/db/models/knowledge.py` — `TradeLesson`
- Collection: `trade_lessons`

## Key fields

- `order_id` (FK), `outcome` (`profit`/`loss`/`breakeven`), `profit_pct`, `profit_amount`
- `lesson_summary`, `market_context: dict`
- `mistakes`, `successes`, `recommendations` (lists)
- `symbol`, `side` (`buy`/`sell` — `long`/`short` aliases normalized), `entry_price`, `exit_price`, `duration_minutes`
- `context_prefix`, `embedding` (768-dim)

## Used by

- TradeLearner service (post-trade hook)
- [[RAG Retrieval Pipeline]] — `lesson` collection with 7-day time-decay
- [[Knowledge Graph Edges]] — `LEARNED_FROM` edges to orders

## Special features

- TEXT index on `lesson_summary` for hybrid search
- `field_validator` normalizes `outcome` / `side` string aliases (`long` → `buy`)

## See also

- [[_index]]
- [[Order Model]]
