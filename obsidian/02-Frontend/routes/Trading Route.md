---
tags: [frontend, routes]
---

# Trading Route

> `/trading` — live market monitor with positions, holdings, watchlist tabs.

## Source

- `frontend/src/routes/trading.tsx`

## How it works

Calls `requireAuth()` in `beforeLoad`. Page mounts the tabs from
[[Trading Components]] (`PositionsTab`, `HoldingsTab`, `WatchlistTab`), a
`MarketOverviewPanel`, and `RecentOrderActivity`. Ticker / position data
streams via [[marketStore]] and the WebSocket (see [[useWebSocket Hook]]),
with REST snapshots cached by [[React Query Options]].

## Depends on

- [[Trading Components]]
- [[marketStore]]
- [[tradeStore]]
- [[orderStore]]

## See also

- [[_index]]
- [[Trades Route]]
