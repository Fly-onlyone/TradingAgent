---
tags: [backend, api, websocket, market]
---

# Market WS Channel

> Public real-time market data streams under `/ws/market` — tickers, orderbook, trades.

## Source

- `backend/app/api/websocket/market.py`

## How it works

No authentication required — these channels relay public OKX market data. Each endpoint resolves a channel name from the path symbol (e.g. `ticker:BTC-USDT`) and registers the socket with [[WS Connection Manager]]. The OKX websocket adapter (separate background task) is the producer — it calls `manager.broadcast_to_channel()` on incoming ticks. Clients can multi-subscribe on `/tickers` via a comma-separated `symbols` query param.

## Endpoints

- `WS /ws/market/ticker/{symbol}` — single-symbol stream
- `WS /ws/market/tickers?symbols=…` — multi-symbol stream
- `WS /ws/market/orderbook/{symbol}` — book updates
- `WS /ws/market/trades/{symbol}` — public-trade stream

## Depends on

- [[WS Connection Manager]]
- [[OKX Exchange]] websocket adapter

## See also

- [[_index]]
- [[Market Endpoints]]
