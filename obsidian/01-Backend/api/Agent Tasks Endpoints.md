---
tags: [backend, api, agent]
---

# Agent Tasks Endpoints

> CRUD + lifecycle controls for scheduled [[AgentTask Model]] documents under `/agent/tasks`.

## Source

- `backend/app/api/v1/agent_tasks.py`

## How it works

Tasks bundle capability toggles (`trading_enabled`, `monitoring_enabled`, `use_subagents`), schedules (cron / time-of-day / interval), trading constraints (`risk_level`, `max_position_size`, `max_daily_trades`), and monitoring conditions. CRUD endpoints push schedule changes through `task_scheduler.schedule_task()` so APScheduler stays in sync. `pause`/`resume` flip status without removing rows. `run-now` queues an immediate execution; `run-now-local` is a localhost-only no-auth alias for the tray-menu binding. `merge-duplicates` is a one-shot consolidator that calls [[Task Merger]] to AI-merge all of the user's tasks into one (with deterministic fallback). Emergency-stop endpoints flip the global latch in [[AppSettings Model]].

## Endpoints

- `POST /agent/tasks` / `GET /agent/tasks`
- `GET/PUT/DELETE /agent/tasks/{id}`
- `POST /agent/tasks/{id}/pause` / `…/resume` / `…/run-now` / `…/history`
- `POST /agent/tasks/merge-duplicates`
- `POST /agent/tasks/emergency-stop` / `…/resume-all` / `GET /agent/tasks/emergency-status`
- `POST /agent/tasks/run-now-local` — tray menu, localhost-only

## Depends on

- [[AgentTask Model]]
- [[Task Scheduler]]
- [[Task Merger]]

## See also

- [[_index]]
- [[Chat-Session Lifecycle]]
