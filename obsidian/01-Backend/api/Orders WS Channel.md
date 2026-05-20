---
tags: [backend, api, websocket, orders]
---

# Orders WS Channel

> Authenticated per-user streams for order, position, and balance updates under `/ws/orders`.

## Source

- `backend/app/api/websocket/orders.py`

## How it works

Each endpoint requires a JWT in the `token` query param. `get_user_id_from_token()` decodes the email-bearing token and hashes the email mod 1,000,000 to derive a placeholder int user-id (the same helper short-circuits if the token is invalid). Channels are `orders:user:{id}`, `positions:user:{id}`, and `balance:user:{id}`. The Order executor + market services call `manager.send_to_user(user_id, ...)` to fan messages out. Clients only need to handle `ping`/`pong` plus the inbound update events.

## Endpoints

- `WS /ws/orders?token=…` — order lifecycle
- `WS /ws/orders/positions?token=…`
- `WS /ws/orders/balance?token=…`

## Depends on

- [[WS Connection Manager]]
- [[Auth Endpoints]] (JWT decode)

## Gotchas

- Uses a stable but lossy `hash(email) % 1_000_000` id — DO NOT use the result outside this WS namespace.

## See also

- [[_index]]
- [[Orders Endpoints]]
