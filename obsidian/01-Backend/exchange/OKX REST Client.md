---
tags: [backend, exchange]
---

# OKX REST Client

> Async wrapper around `python-okx` covering account, trading, market data, and
> instrument metadata — with Sentry spans, retry, and sandbox guard rails.

## Source

- `backend/app/exchange/okx_client.py` (`OKXClient`)

## How it works

`OKXClient.create()` is the canonical entry point: it reads credentials from
`AppSettings` (`get_okx_api_key/secret/passphrase`) and falls back to the
process env vars before constructing the SDK clients. The SDK is always
initialised with `flag="0"` (production) — sandbox mode is enforced *above*
the SDK by short-circuiting `place_order` / `cancel_order` with an error
response, so we never touch OKX's stale sandbox order book.

Every public method routes through `_traced()`, which wraps the synchronous
SDK call in `asyncio.to_thread()` inside a `sentry_sdk.start_span(op="http.client")`.
On `OSError` or `httpx.RequestError` (transient DNS / TCP), it sleeps 1 s and
retries once. Methods cover: account balance/positions/config, place/cancel/
inspect orders, ticker, orderbook, candlesticks (`bar` ranges `1m`-`1M`), and
instrument listing. See [[Order Format Conversion]] for the OKX-specific
order param shape.

## Depends on

- `python-okx`, `httpx`, `sentry-sdk`
- [[App Settings]] (encrypted credential fields)

## Used by

- [[OrderExecutor]]
- Market-data endpoints, position pages, instrument selectors

## See also

- [[_index]]
- [[OKX Exchange]]
- [[OKX WebSocket]]
