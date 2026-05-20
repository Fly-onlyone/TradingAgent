---
tags: [frontend, routes]
---

# Orders Route

> `/orders` — open + recent orders with cancel / modify actions.

## Source

- `frontend/src/routes/orders.tsx`

## How it works

`requireAuth()` guard. Reads from [[orderStore]] and React Query (`ordersQueryOptions`).
Orders are categorized into Open / Filled / Cancelled tabs. Cancel actions go
through `ConfirmDialog` and call the OKX-backed cancel endpoint. Real-time
updates arrive over the WebSocket (see [[useWebSocket Hook]]).

## Depends on

- [[orderStore]]
- [[React Query Options]]
- [[DataTable]]

## See also

- [[_index]]
- [[Trading Route]]
