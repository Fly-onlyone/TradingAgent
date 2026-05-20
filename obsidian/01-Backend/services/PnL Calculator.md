---
tags: [backend, services, accounting]
---

# PnL Calculator

> Trade-performance aggregation over filled [[Order Model]] documents — list, summary, per-symbol grouping, and CSV/JSON export.

## Source

- `backend/app/services/pnl_calculator.py`

## How it works

Pure-function module (no service class). All helpers query `Order` with `status=FILLED` and `is_closing_order=False` so only entry rows are counted.

- `get_trades()` — paginated, filterable list of `TradePnL` rows.
- `get_trades_summary()` — aggregate `TradeSummary` (totals, win rate, profit factor, avg/best/worst).
- `get_trades_by_symbol()` — per-symbol `TradesBySymbol` groupings sorted by P&L.
- `close_trade(order_id, exit_price, fees)` — sets `entry_price` if unset, calls `order.calculate_pnl()`, saves, and fires `asyncio.create_task(_extract_trade_lesson(order))` so [[Trade Learner]] runs out-of-band.
- `export_trades()` — CSV or JSON, datetimes serialized as ISO strings.

## Depends on

- [[Order Model]]
- [[Trade Learner]] (fire-and-forget)

## Used by

- [[Orders Endpoints]]
- [[Dashboard Endpoints]]

## See also

- [[_index]]
