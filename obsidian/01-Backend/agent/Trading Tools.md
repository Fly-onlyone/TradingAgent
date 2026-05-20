---
tags: [backend, agent, tools]
---

# Trading Tools

> Read-side trading helpers — balances, positions, and open orders — straight from OKX.

## Source

- `backend/app/agent/tools/trading_tools.py`

## How it works

Three async functions wrap the [[OKX REST Client]]:

- `get_account_balance()` flattens `details[]` into a `{currency: {available, frozen, equity}}` map and surfaces `total_equity_usd`.
- `get_open_orders(symbol)` returns a `{orders, count}` shape with normalized numeric fields.
- `get_positions()` is the live derivatives-style positions view.

All three return `{"error": "..."}` on a non-zero OKX code so callers (and the LLM via [[MCP Tools]]) can short-circuit without raising.

The actual order-placement path lives in [[OrderExecutor]] — these helpers are read-only and used pervasively by [[RiskManager]], the trading agent's mandatory "portfolio check" step, and any UI surface that needs a quick balance snapshot.

## Depends on

- [[OKX REST Client]]

## Used by

- [[MCP Tools]] (`mcp_get_account_balance`, `mcp_get_open_orders`, `mcp_get_positions`)
- [[RiskManager]]
- [[TradingAgent]] (decision-framework "Portfolio Check" step)

## See also

- [[_index]]
- [[OrderExecutor]]
