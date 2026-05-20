---
tags: [backend, exchange]
---

# OKX WebSocket

> Async client over `okx.websocket.WsPublicAsync` / `WsPrivateAsync` —
> subscribes to tickers, books, trades, candles, orders, positions, account.

## Source

- `backend/app/exchange/okx_websocket.py` (`OKXWebSocket`)

## How it works

Two sockets live on the instance: `public_ws` (no auth, market data) and
`private_ws` (HMAC-signed, account + order updates). `create()` mirrors
[[OKX REST Client]] — pulls credentials from `AppSettings`. The public/private
URLs are hardcoded to production (`wss://ws.okx.com:8443`); the sandbox URLs
are kept as class constants but not used (same reasoning as the REST client).

Callbacks register via `on(channel, async_callback)`. Inbound JSON is parsed
by `_public_message_handler` / `_private_message_handler`, which ignore
`event` frames (`subscribe`, `login`, `error`) and dispatch the rest to
registered callbacks via `asyncio.ensure_future(_dispatch(channel, data))`.
Subscription helpers (`subscribe_ticker`, `subscribe_orderbook`,
`subscribe_candlesticks`, `subscribe_orders`, `subscribe_positions`,
`subscribe_account`) auto-connect the relevant socket if absent.

## Depends on

- `python-okx` (`WsPublicAsync`, `WsPrivateAsync`)
- [[App Settings]]

## Used by

- Live market feeds (frontend WebSocket bridge)
- Order tracking
- [[OrderExecutor]] (position close confirmations)

## Gotchas

- `_dispatch` uses `ensure_future` (fire-and-forget) — exceptions inside callbacks are logged but don't propagate.
- Reconnection is delegated to the OKX SDK; the wrapper only marks `_running` for the `wait()` loop.

## See also

- [[_index]]
- [[OKX Exchange]]
