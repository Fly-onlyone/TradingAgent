---
tags: [backend, agent, scheduling]
---

# Task Scheduler

> APScheduler-based orchestrator for user trading tasks and background jobs (auto-discovery, pattern mining, news crawl, session cleanup). Owns the per-task `TradingAgent` lifecycle with retries, memory telemetry, and emergency-stop gating.

## Source

- `backend/app/agent/task_scheduler.py`

## How it works

`AgentTaskScheduler` wraps an `AsyncIOScheduler` and a `PeriodicJobManager` (see [[Periodic Job]]). User-scheduled `AgentTask` rows become cron/interval/date triggers; recurring background work (strategy discovery, pattern mining, news crawl, stale-session cleanup) is registered via `PeriodicJob` descriptors.

Each task run executes inside `_run_with_fresh_agent()`: it spawns a new `TradingAgent` (so a poisoned conversation never bleeds across runs), wraps the call with [[Memory Telemetry]] checkpoints, and retries on transient errors. Auth-error patterns trigger refresh handling.

`is_emergency_stopped()` fails closed — if `AppSettings` can't be loaded the latch is treated as ON, halting scheduled trading globally. Discovery, pattern mining, and trade execution all gate on it.

The class also persists each run's chat into an `AgentSession` (`session_kind=TASK_RUN`) via [[Session Recorder]] helpers and fires `TASK_COMPLETED` / `TASK_FAILED` notifications.

## Depends on

- APScheduler (`AsyncIOScheduler`, cron/interval/date triggers)
- [[Periodic Job]] — `PeriodicJob`, `PeriodicJobManager`
- [[Startup Reconciler]] — orphan cleanup on init
- [[TradingAgent]] — `create_agent_with_tools`
- [[AgentTask Model]], [[AgentSession Model]], `AgentDecision`, [[Notification Service]]

## Used by

- App startup hook
- `/tasks/*` REST endpoints

## Gotchas

- Cancel signals route through `self._task_runners[task_id]` — never cancel by job id directly.
- `agent_channel_user_id()` must hash to the same value the WS handler computes; constants module owns that.

## See also

- [[_index]]
- [[Periodic Job]]
- [[Startup Reconciler]]
- [[Chat-Session Checklist]]
