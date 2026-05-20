---
tags: [backend, api, trading]
---

# Orders Endpoints

> Manual order placement, listing, cancel, and trade analytics under `/orders`.

## Source

- `backend/app/api/v1/orders.py`

## How it works

`POST /orders` builds an [[Order Model]] row and dispatches it through `OrderExecutor` (the subagent) so the same risk-aware path used by the [[Trading Decision Flow]] is reused. List/get queries are scoped by `user_id`. The `/trades*` family is a thin proxy over [[PnL Calculator]] (`get_trades`, `get_trades_summary`, `get_trades_by_symbol`, `export_trades`). The `/okx/*` endpoints bypass local storage and read live OKX state via `OKXClient` (open orders, history, cancel).

## Endpoints

- `POST /orders` — place a new order
- `GET /orders` — list local orders (paginated, filterable)
- `GET /orders/trades` / `…/summary` / `…/by-symbol` / `…/export`
- `GET /orders/okx/open` / `…/history` — live OKX state
- `POST /orders/okx/cancel` — cancel a live OKX order
- `GET /orders/{id}` / `POST /orders/{id}/cancel`

## Depends on

- [[Order Model]]
- [[PnL Calculator]]
- [[OKX REST Client]]
- `OrderExecutor` subagent

## See also

- [[_index]]
- [[Trading Decision Flow]]
