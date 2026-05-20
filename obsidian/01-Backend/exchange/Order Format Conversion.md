---
tags: [backend, exchange]
---

# Order Format Conversion

> OKX expects camelCase param names and string-encoded numerics — the REST
> client maps our snake_case Python kwargs to that schema inside `place_order`.

## Source

- `backend/app/exchange/okx_client.py` (`place_order`, `cancel_order`, `get_order`)

## How it works

OKX-specific naming and encoding that the wrapper applies on the way out:

| Our kwarg          | OKX param   | Notes |
|--------------------|-------------|-------|
| `inst_id`          | `instId`    | e.g. `BTC-USDT` |
| `side`             | `side`      | `buy` or `sell` (lowercase) |
| `order_type`       | `ordType`   | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `size` (`Decimal`) | `sz` (str)  | Always stringified — OKX rejects floats |
| `price` (`Decimal` or `None`) | `px` (str or `""`) | Empty string for market orders |
| `client_order_id`  | `clOrdId`   | `""` if not provided |
| `reduce_only`      | `reduceOnly`| Boolean |
| `tdMode`           | `tdMode`    | Hardcoded to `"cash"` (spot) |

**Spot semantics**: for a buy-market order, `sz` is interpreted as quote
currency notional (USDT amount); for sell-market it's base size. Buy-limit
uses base size + limit price. This base-vs-quote distinction is the most
common foot-gun when wiring up new order code. Sandbox mode short-circuits
both `place_order` and `cancel_order` with `{"code": "-1"}` before any
SDK call.

## Depends on

- [[OKX REST Client]]
- [[Order Model]]

## Used by

- [[OrderExecutor]]

## Gotchas

- Decimal → str round-trip is intentional: OKX silently rejects scientific notation.
- `tdMode="cash"` means spot only — margin or perpetual flows need a different value.

## See also

- [[_index]]
- [[OKX Exchange]]
