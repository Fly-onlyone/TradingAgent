---
tags: [backend, api, agent, decisions]
---

# Agent Decisions Endpoints

> List, inspect, confirm/reject, and provide feedback on [[AgentDecision Model]] documents under `/agent/decisions`.

## Source

- `backend/app/api/v1/agent_decisions.py`

## How it works

Decisions are records of the agent's proposed actions (BUY/SELL/HOLD/TASK_MODIFICATION) with confidence, market context, reasoning, and tool-call breadcrumbs. `POST /{id}/confirm` and `…/reject` route through [[Agent Execution Service]] (which validates `expires_at`, flips status, executes via `task_scheduler.execute_trade_for_decision`, and records `execution_status`/error fields). `POST /{id}/feedback` accepts user-provided rating + commentary used by [[Trade Learner]] for downstream learning. `/stats` aggregates win-rate-by-symbol/action over a date window.

## Endpoints

- `GET /agent/decisions` — paginated list, filterable
- `GET /agent/decisions/pending` — pending-confirmation queue
- `GET /agent/decisions/stats` — aggregates
- `GET /agent/decisions/symbols` — distinct symbols
- `GET /agent/decisions/{id}` — full detail with tool usage
- `POST /agent/decisions/{id}/confirm` / `…/reject` / `…/feedback`

## Depends on

- [[AgentDecision Model]]
- [[Agent Execution Service]]

## See also

- [[_index]]
- [[Trading Decision Flow]]
