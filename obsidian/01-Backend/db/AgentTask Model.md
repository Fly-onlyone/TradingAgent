---
tags: [backend, db, model]
---

# AgentTask Model

> A user-owned scheduled agent job — multi-schedule cron config, capability toggles, risk envelope, and consecutive-failure auto-pause.

## Source

- `backend/app/db/models/agent_task.py`
- Collection: `agent_tasks`

## Key fields

- `user_id`, `name`, `description`
- Capabilities: `trading_enabled`, `monitoring_enabled` (analysis always on)
- `schedules: list[TaskSchedule]` (once/interval/daily/weekly/custom), `timezone`
- `symbols`, `risk_level`, `holding_term`, `agent_mode` (`auto`/`ask`), `task_modification_mode`
- `max_position_size`, `max_daily_trades`, `use_subagents`, `custom_instructions`
- `monitoring_conditions: list[MonitoringCondition]`, `alert_cooldown_minutes`
- Retry/health: `max_retries`, `consecutive_failures`, `max_consecutive_failures`
- Status: `status`, `paused_by_emergency_stop`, `run_count`, `success_count`, `failure_count`, `last_error`, `last_decision_id`, `last_session_id`
- `next_run_at` (indexed)

## Used by

- [[Task Scheduler]]
- [[TradingAgent]] execution loop

## Special features

- `migrate_legacy_fields` validator converts `task_type` + single-schedule to multi-schedule
- `record_execution()` + `should_auto_pause` property
- `pause(by_emergency=True)` / `resume()` distinguish emergency-paused tasks

## See also

- [[_index]]
- [[AgentDecision Model]]
- [[AgentSession Model]]
