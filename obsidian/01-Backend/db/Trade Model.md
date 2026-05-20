---
tags: [backend, db, model, timeseries]
---

# Trade Model

> Individual trade tick from the exchange, stored in a MongoDB time-series collection keyed by symbol.

## Source

- `backend/app/db/models/market.py` — `Trade`
- Collection: `trades` (time-series)

## Key fields

- `symbol` (indexed), `timestamp` (time field), `trade_id` (indexed), `price`, `quantity`, `side` (`buy`/`sell`)
- `created_at`

## Used by

- Tape-reading / volume profile analytics
- Pattern mining inputs

## Special features

- **Time-series collection** with `time_field=timestamp`, `meta_field=symbol`, `granularity=seconds`
- Susceptible to the [[Time-Series Index Conflict Recovery]] retry loop on init

## See also

- [[_index]]
- [[MarketData Model]]
