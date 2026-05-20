---
tags: [backend, db, model]
---

# AgentDecision Model

> Persisted AI decision — analysis, recommendation, or executed trade with full reasoning, market context, and tool-call audit.

## Source

- `backend/app/db/models/agent_decision.py`
- Collection: `agent_decisions`

## Key fields

- `user_id`, `session_id`, `task_id`
- `decision_type` (`DecisionType`), `symbol`, `action` (`DecisionAction`), `confidence`, `status` (`DecisionStatus`)
- `summary`, `reasoning`, `key_factors`, `proposed_changes`
- Trade specifics: `suggested_entry`, `suggested_stop_loss`, `suggested_take_profit`, `suggested_position_size`, `risk_reward_ratio`
- Execution: `order_id`, `execution_price`, `execution_status` (`ExecutionStatus`), `execution_error_code/message`
- `tools_used: list[ToolUsage]`, `market_context: MarketContext`, `model_used`
- `user_feedback`, `feedback_comment`
- `confirmed_at`, `executed_at`, `expires_at`

## Used by

- [[TradingAgent]] writes one per cycle
- ASK-mode confirmation flow + [[Notification Service]]
- [[Trading Decision Flow]]

## Special features

- `confirm()` / `reject()` / `mark_executed()` / `mark_execution_failed()` / `expire()` helpers
- Multiple indexes by `(user_id, task_id, ...)` for task history
- `ExecutionStatus` lifecycle separate from `DecisionStatus`

## See also

- [[_index]]
- [[Order Model]]
- [[Notification Model]]
