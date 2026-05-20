---
tags: [backend, agent, subagent]
---

# RiskManager

> Deterministic (non-LLM) subagent that sizes positions, scores trade risk, and reports portfolio concentration.

## Source

- `backend/app/agent/subagents/risk_manager.py`

## How it works

`calculate_position_size()` derives an ATR-based stop-loss (1.5× ATR by default, falling back to `default_stop_loss_pct`), computes `risk_amount = equity × risk_pct`, then `position_size = risk_amount / stop_loss_distance`. The result is capped by `max_position_pct` and returns full pricing for stop-loss, take-profit, and risk/reward.

`assess_trade_risk()` builds a 0–100 risk score from position-size overage, RSI extremes, Bollinger-band edges, ATR-based volatility, and trend conflict (e.g. buying into a bearish trend). It maps the score to `HIGH / MEDIUM / LOW-MEDIUM / LOW` and a recommendation (`AVOID / CAUTION / ACCEPTABLE / PROCEED`).

`get_portfolio_risk()` reads the OKX balance and surfaces concentration warnings (e.g. >50% in one asset).

## Depends on

- [[Trading Tools]] — `get_account_balance`
- [[Market Tools]] — `get_ticker`
- [[Technical Tools]] — `get_technical_indicators` for ATR/RSI/BB/trend
- [[App Settings]] — `max_position_size_pct`, `default_stop_loss_pct`, `default_take_profit_pct`

## Used by

- [[OrderExecutor]] — auto-blocks `AVOID` trades

## Gotchas

- Pure async functions; no LLM, no [[ClaudeSDKClient]]. Cheap to call.

## See also

- [[_index]]
- [[OrderExecutor]]
