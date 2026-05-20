---
tags: [backend, agent, subagent]
---

# OrderExecutor

> Subagent that places, cancels, and tracks OKX orders behind a risk gate and an idempotency key — the only path from agent reasoning to real money.

## Source

- `backend/app/agent/subagents/order_executor.py`

## How it works

`execute_trade()` validates inputs, then short-circuits if an `Order` already exists for `(user_id, execution_idempotency_key)` in a live status. Optional `max_position_size` (quote currency) is enforced before any exchange call — for market orders it fetches the ticker to estimate value.

Unless `skip_risk_check=True`, it calls [[RiskManager]] `assess_trade_risk` and rejects on `AVOID`. It then inserts a `PENDING` `Order` row (catching `DuplicateKeyError` as a second idempotency layer), submits to OKX through [[OKX REST Client]], and updates the row with `exchange_order_id` and `OPEN` status. On rejection or exception the row flips to `REJECTED`.

`execute_with_risk_params()` first asks [[RiskManager]] to size the position, then forwards into `execute_trade`. `cancel_order` / `get_order_status` / `get_open_orders` round out the surface.

## Depends on

- [[RiskManager]]
- [[OKX REST Client]] — `OKXClient.create()`, `place_order`, `cancel_order`
- `Order` document with unique `(user_id, execution_idempotency_key)` index

## Used by

- [[TradingAgent]] `execute_trade()`
- Task-run flows in [[Task Scheduler]]

## Gotchas

- `client_order_id` is the first 32 chars of the idempotency key (OKX limit).
- The `Order` row only persists when `user_id` is set — agent calls without one bypass DB persistence.

## See also

- [[_index]]
- [[OKX Exchange]]
