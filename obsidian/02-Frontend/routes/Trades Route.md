---
tags: [frontend, routes]
---

# Trades Route

> `/trades` — historical trade ledger with filter bar, summary cards, per-symbol accordion, export.

## Source

- `frontend/src/routes/trades/index.tsx`

## How it works

`requireAuth()` guards the route. Renders `TradeSummaryCards` + `TradeFilterBar`
+ `TradeTable` (which is built on [[DataTable]]) and `TradesBySymbolAccordion`
under tabs. Filters update local state and trigger React Query refetches against
`/api/v1/trades/...`; the export button hits the CSV/JSON endpoint with the
active filters.

## Depends on

- [[Trades Components]]
- [[tradeStore]]
- [[Chart Components]] (`PnLChart`)

## See also

- [[_index]]
- [[Trading Route]]
