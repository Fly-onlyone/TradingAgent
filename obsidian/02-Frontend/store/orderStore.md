---
tags: [frontend, store, orders]
---

# orderStore

> In-memory cache of `Order[]` and `Position[]` plus their loading flags. Updated by REST fetches and the orders WebSocket.

## Source

- `frontend/src/store/orderStore.ts`

## How it works

Plain Zustand store (no persist, no devtools). `setOrders` / `setPositions` replace the list; `updateOrder` matches by `id` and swaps; `updatePosition` is an upsert by `symbol`. `removeOrder` / `removePosition` filter. The pattern leaves the store passive — fetchers and WS handlers drive updates, components read selectors. `clearOrders()` empties both lists on logout/disconnect.

## Depends on

- `@/types` (`Order`, `Position`)

## Used by

- Orders page
- [[Orders WS Channel]]

## See also

- [[_index]]
- [[Orders Endpoints]]
