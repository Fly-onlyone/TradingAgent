---
tags: [backend, api, dashboard]
---

# Dashboard Endpoints

> Single aggregated payload for the dashboard's first-screen render under `/dashboard`.

## Source

- `backend/app/api/v1/dashboard.py`

## How it works

`GET /dashboard/summary` composes `AccountBalanceResponse` (via `market.get_account_balance`), `TradeSummary` + recent trades (via [[PnL Calculator]]), recent + total [[AgentDecision Model]] counts, and the most recent [[AgentTask Model]]'s `agent_mode`. The response is cached per-user for 5 seconds in a module-level dict and returned via `model_copy(deep=True)` so concurrent requests get isolated payloads. Reduces frontend cold-load from 4 parallel requests to 1.

## Endpoints

- `GET /dashboard/summary` — composite account + trades + decisions + active task mode

## Depends on

- [[Market Endpoints]]
- [[PnL Calculator]]
- [[AgentDecision Model]]
- [[AgentTask Model]]

## See also

- [[_index]]
