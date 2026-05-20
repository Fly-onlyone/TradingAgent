---
tags: [backend, db]
---

# Time-Series Index Conflict Recovery

> `init_db()` retries Beanie initialization up to five times, dropping any conflicting time-series index reported by MongoDB code 85.

## Source

- `backend/app/db/session.py` — retry loop in `init_db()`

## How it works

MongoDB time-series collections (used for `market_data` and `trades`) can raise `OperationFailure` code 85 — "equivalent index already exists with the same name but different options" — when stored index metadata drifts from what the current driver emits. The init loop catches that specific error, regex-extracts the conflicting index name (`name: "..."`), and calls `_db[collection].drop_index(name)` on both `market_data` and `trades`. Beanie init is retried up to five times; if no index could be dropped or all retries are exhausted, the original error is re-raised.

## Depends on

- [[MarketData Model]]
- [[Trade Model]]

## Used by

- [[Background Service Startup]]

## Gotchas

- The recovery only touches the two known time-series collections — adding more time-series models needs the loop expanded.
- Non-85 OperationFailures bubble up immediately.

## See also

- [[_index]]
- [[document_models Registration]]
