---
tags: [backend, db, model]
---

# StrategyDiscoveryCycle Model

> One auto-discovery run, linking the Explorer chat session to its fan-out of Extractor sessions plus aggregate counters.

## Source

- `backend/app/db/models/strategy_discovery_cycle.py`
- Collection: `strategy_discovery_cycles`

## Key fields

- `explorer_session_id`, `extractor_session_ids: list`
- Counters: `candidates_found`, `strategies_saved`, `strategies_skipped_low_confidence`, `strategies_failed`
- `status: DiscoveryCycleStatus` (`running` / `ok` / `failed`), `error`
- `manual`, `triggered_by_user_id`
- `started_at` (indexed), `ended_at`

## Used by

- [[Strategy Auto-Discovery Cycle]]
- `/admin/strategy-discovery/cycles` endpoint
- [[Task Scheduler]] cleanup of orphaned `running` cycles on boot

## Special features

- Counters updated in-flight so the admin UI shows live progress without re-joining collections
- `use_state_management = True`

## See also

- [[_index]]
- [[AgentSession Model]]
