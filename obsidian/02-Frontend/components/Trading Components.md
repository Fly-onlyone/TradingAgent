---
tags: [frontend, components, trading]
---

# Trading Components

> Live market monitor surface: positions, tickers, holdings, recent activity.

## Source

- `frontend/src/components/trading/`

## Members

- `PositionCard.tsx` — single OKX position summary with PnL, leverage, SL/TP
- `TickerCard.tsx` — price + 24h change tile, sparkline-backed
- `HoldingsCard.tsx` — spot holdings tile with valuation
- `HoldingsTab.tsx`, `PositionsTab.tsx`, `WatchlistTab.tsx` — tabs inside the trading route
- `RecentOrderActivity.tsx` — recent fills feed
- `MarketOverviewPanel.tsx` — aggregate metrics panel

## Depends on

- [[marketStore]]
- [[tradeStore]]
- [[orderStore]]
- [[React Query Options]]

## Used by

- [[Trading Route]]

## See also

- [[_index]]
- [[Chart Components]]
