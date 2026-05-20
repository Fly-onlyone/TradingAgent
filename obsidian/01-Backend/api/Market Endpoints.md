---
tags: [backend, api, market]
---

# Market Endpoints

> OKX-backed market data — OHLCV, tickers, account balance, market overview — under `/market`.

## Source

- `backend/app/api/v1/market.py`

## How it works

Each handler proxies `OKXClient` and caches the response in a module-level dict keyed by symbol or user. TTLs: account=5s, ticker=5s, overview=15s. OHLCV reads also persist normalized candle rows into [[MarketData Model]] for offline analysis. Cache values are deep-copied on read so concurrent requests don't mutate each other's responses. All endpoints require `get_current_active_user`.

## Endpoints

- `GET /market/ohlcv/{symbol}` — historical candles
- `GET /market/ticker/{symbol}` — single ticker
- `GET /market/tickers` — bulk tickers
- `GET /market/account` — balances + UPL across currencies (per-user cache)
- `GET /market/overview` — top-symbol summary for the dashboard
- `GET /market/symbols` — tradable symbol list from OKX

## Depends on

- [[OKX REST Client]]
- [[MarketData Model]]

## See also

- [[_index]]
- [[Market WS Channel]]
