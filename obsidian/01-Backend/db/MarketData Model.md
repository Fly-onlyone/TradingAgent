---
tags: [backend, db, model, timeseries]
---

# MarketData Model

> OHLCV candles for a `(symbol, timeframe)` pair, stored in a MongoDB time-series collection at minute granularity.

## Source

- `backend/app/db/models/market.py` — `MarketData`
- Collection: `market_data` (time-series)

## Key fields

- `symbol`, `timeframe` (e.g. `1m`, `1h`, `1D`), `timestamp` (time field)
- `open`, `high`, `low`, `close`, `volume`, `quote_volume`
- Extras: `trade_count`, `taker_buy_volume`, `taker_sell_volume`

## Used by

- TechnicalAnalyst subagent indicator math
- Pattern mining service
- Chart endpoints

## Special features

- **Time-series collection**, `meta_field=symbol`, `granularity=minutes`
- Subject to [[Time-Series Index Conflict Recovery]]

## See also

- [[_index]]
- [[Trade Model]]
