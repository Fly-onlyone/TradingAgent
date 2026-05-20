---
tags: [backend, services, execution]
---

# Agent Execution Service

> Shared confirm-and-execute pipeline for pending `AgentDecision`s — invoked from REST, notification clicks, and WS handlers.

## Source

- `backend/app/services/agent_execution_service.py`

## How it works

`confirm_and_execute_decision(decision_id, user_id, source)` is the single entry point for actioning a PENDING decision. It loads the decision (scoped by `user_id`), validates status + `expires_at`, flips it to `CONFIRMED` + `SUBMITTED`, then branches on `decision_type`:

- `TASK_MODIFICATION` → `_apply_task_modification()` coerces `proposed_changes.after` via `coerce_task_changes`, mutates the linked [[AgentTask Model]] field-by-field, reschedules through `task_scheduler.schedule_task()` when `schedules` changed, and inserts a `TASK_MODIFICATION_APPLIED` [[Notification Model]].
- BUY/SELL → delegates to `task_scheduler.execute_trade_for_decision()` which routes through `OrderExecutor`.

Every failure path stamps `execution_error_code` + `execution_error_message` on the decision so the UI can render reasons. Accessed via `get_agent_execution_service()` singleton.

## Depends on

- [[AgentDecision Model]]
- [[AgentTask Model]]
- [[Task Scheduler]]
- [[Notification Service]]

## Used by

- [[Agent Decisions Endpoints]]
- [[Notification Service]] (trade-confirmation action handler)

## See also

- [[_index]]
- [[Trading Decision Flow]]
