---
tags: [backend, db, model]
---

# Order Model

> A trading order (entry or exit) with exchange identifiers, fill state, risk levels, and realized P&L tracking.

## Source

- `backend/app/db/models/order.py`
- Collection: `orders`

## Key fields

- `user_id`, `exchange_order_id`, `client_order_id`, `execution_idempotency_key`
- `symbol`, `side` (`OrderSide`), `order_type`, `status` (`OrderStatus`)
- `quantity`, `filled_quantity`, `price`, `avg_fill_price`, `stop_price`
- `stop_loss_price`, `take_profit_price`
- P&L: `entry_price`, `exit_price`, `realized_pnl`, `realized_pnl_percent`, `fees_paid`, `net_pnl`
- `related_order_id`, `is_closing_order`, `trade_status` (`TradeStatus`), `closed_at`
- `agent_reasoning` (dict), `strategy_id`

## Used by

- [[OKX Exchange]] order executor
- [[TradingAgent]] tool calls
- [[Trading Decision Flow]]

## Special features

- Unique partial index on `(user_id, execution_idempotency_key)` prevents double-submit
- `calculate_pnl()` computes long/short P&L and flips `trade_status` to closed

## See also

- [[_index]]
- [[AgentDecision Model]]
