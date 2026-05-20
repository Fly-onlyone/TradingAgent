---
tags: [backend, agent, scheduling]
---

# Periodic Job

> Reusable interval-job descriptor that factored out the copy-pasted scheduling glue shared by strategy discovery, pattern mining, news crawl, and session cleanup.

## Source

- `backend/app/agent/scheduling/periodic_job.py`

## How it works

`PeriodicJob` is a frozen dataclass: `job_id`, `name`, `last_run_field` (AppSettings attribute to stamp on success), `enabled(settings) -> bool`, `interval(settings) -> timedelta`, `runner()`, optional Sentry op, optional log label, and `fire_when_settings_unavailable` (the news crawl needs this — it has no enable flag).

`PeriodicJobManager.register(job)` reads [[App Settings]], removes any existing job with the same id, gates on `job.enabled(settings)`, then schedules an `IntervalTrigger` whose runner wraps the user runner with:

1. A Sentry transaction (when `sentry_op` is set).
2. A `try/except` that logs and swallows so one failure doesn't kill the scheduler.
3. `last_run_field` stamping with `datetime.now(UTC)`.

`_maybe_catch_up()` fires one immediate run if `last_run_at` is older than the interval — so a crash/restart doesn't silently lose a cycle.

## Depends on

- APScheduler — `AsyncIOScheduler`, `IntervalTrigger`
- [[App Settings]] — `*_last_run_at`, enable flags
- `sentry_sdk`

## Used by

- [[Task Scheduler]] — strategy discovery, pattern mining, news crawl, session cleanup

## See also

- [[_index]]
- [[Task Scheduler]]
- [[Startup Reconciler]]
