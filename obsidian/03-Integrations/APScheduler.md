---
tags: [integrations]
---

# APScheduler

> Python cron-style scheduler powering background jobs in the backend.

## Used for

- News crawler cadence
- [[Strategy Auto-Discovery Cycle]] ticks
- Trade learning cycles
- Periodic AppSettings checks

## Configuration

- `apscheduler>=3.10.0`
- Wired up in `backend/app/agent/task_scheduler.py`
- Timezone via `tzlocal>=5.0`

## Gotchas

- Long-running jobs must wrap the cycle body in try/except and flip any "running" rows to failed on error — see [[Chat-Session Checklist]]
- Orphan cycles need a startup cleanup hook (`_mark_orphaned_discovery_cycles_failed`)

## See also

- [[_index]]
- [[Strategy Auto-Discovery Cycle]]
- [[Background Service Startup]]
