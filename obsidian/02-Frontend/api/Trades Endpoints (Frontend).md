---
tags: [frontend, api, trades]
---

# Trades Endpoints (Frontend)

> `tradesApi` — paginated trades with P&L, aggregate summary, by-symbol grouping, CSV/JSON export.

## Source

- `frontend/src/api/endpoints/trades.ts`

## How it works

`getTrades(filter)` maps camelCase filter (`startDate`, `pageSize`) to snake_case query params and returns a `TradeListResponse` with each row passed through `transformTrade` (`entry_price → entryPrice`, `realized_pnl_percent → realizedPnlPercent`, etc.). `getSummary` returns aggregated win-rate / profit-factor / volume stats. `getBySymbol` returns one block per symbol containing nested trades. `exportTrades(format, range)` returns a `Blob` (`responseType: "blob"`) so the UI can offer "Save as".

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- Trades page, dashboard P&L widgets

## See also

- [[_index]]
- [[tradeStore]]
- [[Orders Endpoints]] (backend — trades flow through orders/agent endpoints)
