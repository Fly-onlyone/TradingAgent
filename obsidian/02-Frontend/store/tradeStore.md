---
tags: [frontend, store, trades]
---

# tradeStore

> Per-page UI state for the Trades route: filters, view mode, expanded symbols. Wrapped with `devtools`, not persisted.

## Source

- `frontend/src/store/tradeStore.ts`

## How it works

Holds a `TradesFilter` (symbol, side, status, date range, page, pageSize), a `TradeViewMode` (`table` | other), and a `Set<string>` of expanded symbols for the by-symbol grouped view. Every action passes a label as the third `set` arg so the Redux DevTools timeline reads naturally. `setFilters` always resets `page` to 1 when any filter changes; `setPageSize` does the same. `reset()` blows everything back to `initialFilters` and an empty `Set`.

## Used by

- Trades route page and its filter/header components

## See also

- [[_index]]
- [[Orders Endpoints]]
