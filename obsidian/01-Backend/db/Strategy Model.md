---
tags: [backend, db, model]
---

# Strategy Model

> User-owned executable strategy config — rules, symbols, performance, and an optional FK back to its `StrategyKnowledge` RAG counterpart.

## Source

- `backend/app/db/models/strategy.py`
- Collection: `strategies`

## Key fields

- `user_id`, `name`, `description`, `is_active`
- `entry_rules`, `exit_rules`, `risk_params` (dicts)
- `symbols`, `timeframes`
- `backtest_results`, `live_performance`
- `knowledge_id` → [[StrategyKnowledge Model]]
- Discovery: `auto_discovered`, `source_url`
- `last_executed_at`

## Used by

- Strategy execution endpoints
- [[Strategy Auto-Discovery Cycle]] — shadow doc owned by a real user

## Special features

- Pure executable strategy; RAG embedding lives on the linked `StrategyKnowledge`
- `auto_discovered=True` distinguishes scheduler-created from user-imported

## See also

- [[_index]]
- [[StrategyKnowledge Model]]
- [[StrategyDiscoveryCycle Model]]
