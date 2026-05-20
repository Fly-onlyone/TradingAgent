---
tags: [frontend, components, charts]
---

# Chart Components

> Visualizations backed by `lightweight-charts` (vendor chunked separately).

## Source

- `frontend/src/components/charts/`

## Members

- `PnLChart.tsx` — cumulative PnL series, area/line toggle
- `EquityChart.tsx` — equity curve over time
- `PerformanceGauge.tsx` — radial gauge for win rate or Sharpe-like score

## How it works

Charts read from React Query caches via [[React Query Options]], format snake_case
payloads to camelCase locally, and respect the [[MUI Theme]] for color tokens
(`theme.trading.primaryRgb`). Heavy chart bundles are split into the `vendor-charts`
manualChunk in `vite.config.ts`.

## Depends on

- [[tradeStore]]
- [[MUI Theme]]

## Used by

- [[Trading Route]]
- [[Trades Route]]
- [[Dashboard Route]]

## See also

- [[_index]]
