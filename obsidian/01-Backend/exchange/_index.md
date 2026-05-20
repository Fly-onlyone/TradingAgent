---
tags: [backend, exchange, moc]
---

# Exchange Module — MOC

> Map of `backend/app/exchange/` — the OKX integration: REST client wrapping
> `python-okx`, WebSocket streams for market + private data, and the order
> schema conversions that bridge our internal models to OKX.

## Source

- `backend/app/exchange/okx_client.py`
- `backend/app/exchange/okx_websocket.py`

## How it works

Two classes form the integration surface:

- `OKXClient` — async wrapper over `python-okx`'s `Trade`, `Account`,
  `MarketData`, `PublicData` SDKs. Every call goes through a Sentry-spanned
  `asyncio.to_thread()` shim with single retry on transient network failure.
- `OKXWebSocket` — manages public + private socket connections, channel
  subscriptions, and dispatch to async callbacks.

Both classes use a `create()` async factory that pulls live credentials from
`AppSettings` (with env-var fallback). Sandbox mode disables order writes
at the method level — the SDK flag is hardcoded to production ("0") because
the OKX sandbox feeds are stale.

## Notes in this folder

- [[OKX REST Client]]
- [[OKX WebSocket]]
- [[Order Format Conversion]]

## See also

- [[OKX Exchange]]
- [[OrderExecutor]] · [[Order Model]]
