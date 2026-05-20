---
tags: [frontend, hooks, market]
---

# useSymbolOptions

> Fetches the OKX instruments list and groups it for autocomplete: "Popular" (BTC/ETH/SOL etc.) first, then "All Instruments".

## Source

- `frontend/src/hooks/useSymbolOptions.ts`

## How it works

Reads `marketSymbolsQueryOptions()` via [[TanStack Query]] and `useMemo`s a `SymbolOption[]`. Symbols in `POPULAR_PAIRS` are pushed into the Popular group; everything is also added to "All Instruments" so search hits both. If the API doesn't return a popular pair (e.g. fresh DB), a synthetic fallback entry is synthesized from `BASE-QUOTE` splitting. Returns `{ symbolOptions, isLoading }`.

## Depends on

- `@/api/queryOptions/market`
- `@/utils/constants` (`POPULAR_PAIRS`)

## See also

- [[_index]]
- [[ZoomAwareAutocomplete]]
