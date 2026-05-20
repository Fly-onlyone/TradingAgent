---
tags: [frontend, components, trades]
---

# Trades Components

> Historical trade ledger UI with filters, summaries, and per-symbol grouping.

## Source

- `frontend/src/components/trades/`

## Members

- `TradeTable.tsx` — paginated trade rows, sortable columns
- `TradeFilterBar.tsx` — symbol / side / time-range filters
- `TradeSummaryCards.tsx` — total PnL / win rate / count stat strip
- `TradesBySymbolAccordion.tsx` — accordion grouping per ticker
- `OpenPositionsSection.tsx` — open-positions snapshot inside the trades page
- `TradeExportButton.tsx` — CSV/JSON export trigger

## Depends on

- [[tradeStore]]
- [[React Query Options]]
- [[DataTable]]

## Used by

- [[Trades Route]]

## See also

- [[_index]]
