---
tags: [backend, agent, tools]
---

# Market Tools

> Read-side market data — ticker, order book, candlesticks — fronted by a per-call 10-second timeout against OKX.

## Source

- `backend/app/agent/tools/market_tools.py`

## How it works

- `get_ticker(symbol)` returns last price, 24h open, change, change %, and volume.
- `get_orderbook(symbol, depth)` returns bids/asks with mid-price metadata.
- `get_candlesticks(symbol, timeframe, limit)` returns OHLCV rows; the MCP wrapper buffers these into `_last_chart_data` so the WebSocket can emit a chart frame to the UI.

All calls go through [[OKX REST Client]] (`OKXClient.create()` → public-data endpoints) and are wrapped in `asyncio.wait_for(..., timeout=10.0)` so a hanging API can't stall the agent loop. Non-zero OKX codes surface as `{"error": ...}`.

These primitives are the foundation for everything else — [[Technical Tools]], [[RiskManager]], [[TradingAgent]]'s portfolio check, and the chat UI's chart panel all depend on them.

## Depends on

- [[OKX REST Client]]

## Used by

- [[Technical Tools]] — gets candles before computing indicators
- [[RiskManager]] — current price for sizing
- [[MCP Tools]] (`mcp_get_ticker`, `mcp_get_orderbook`, `mcp_get_candlesticks`)

## See also

- [[_index]]
- [[OKX Exchange]]
