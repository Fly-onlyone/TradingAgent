---
tags: [backend, agent, observability]
---

# Memory Telemetry

> Lightweight RSS-sampling helpers used to log structured memory checkpoints around agent lifecycle events — agent create, turn done, etc.

## Source

- `backend/app/agent/memory_telemetry.py`

## How it works

`get_process_rss_mb()` returns the current process's resident-set size in MB via `psutil.Process().memory_info()`, falling back to `None` if `psutil` isn't installed.

`log_memory_checkpoint(logger, *, phase, session_id, task_id, symbol, session_kind, baseline_mb, extra)` samples the RSS, builds a structured log payload (phase, rss_mb, identifiers, optional delta from baseline, custom extras), emits an `INFO` log line carrying those fields via `extra=`, and returns the sample so callers can chain it as the next phase's baseline.

The point isn't to enforce limits — it's to make leaks visible in production logs/Sentry breadcrumbs so per-task memory growth shows up next to the task id and session id.

## Depends on

- `psutil` (optional; soft-fail to `None`)

## Used by

- [[Task Scheduler]] — wraps each per-task agent creation and turn with `task_agent_create_start` / `task_agent_create_done` / `task_agent_turn_done` checkpoints.

## See also

- [[_index]]
