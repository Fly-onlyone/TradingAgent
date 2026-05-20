---
tags: [frontend, components, common]
---

# DataTable

> Generic, typed `DataTable<T>` with sortable columns, pagination, click handlers, and skeleton loading.

## Source

- `frontend/src/components/data-display/DataTable.tsx`

## How it works

Generic over the row type `T`. `Column<T>` entries declare `id`, `label`,
optional `render(row)`, `format(value)`, `sortable`, `align`, and `minWidth`.
The component handles sort state internally (`orderBy` + `order`) and applies
the comparator before pagination. `rowKey` selects a stable field for React
keys — skeleton rows use stable string keys per Biome's `noArrayIndexKey`.
Falls back to `EmptyState` when there are no rows.

## Depends on

- `EmptyState`
- MUI `Table` primitives

## Used by

- `TradeTable.tsx`
- [[Trades Components]] and admin tables

## See also

- [[Common Components]]
