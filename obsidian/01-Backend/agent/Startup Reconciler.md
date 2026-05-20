---
tags: [backend, agent, scheduling]
---

# Startup Reconciler

> Cleans up the database debris a crashed (or `watchfiles`-reloaded) process leaves behind — orphan discovery cycles, stuck `is_active=True` sessions, and legacy per-extractor sessions.

## Source

- `backend/app/agent/scheduling/startup_reconciler.py`

## How it works

`StartupReconciler.reconcile()` runs two steps, each guarded by a broad `try/except`:

1. **`_mark_orphaned_discovery_cycles_failed`** — flips any `StrategyDiscoveryCycle` stuck in `RUNNING` to `FAILED` with `error="Process restarted while cycle was running"`. Then closes any `AgentSession` rows whose titles match `^Strategy Explorer` or whose `session_kind=TASK_RUN` are still `is_active=True`. Also hard-deletes legacy `^Strategy Extract` sessions (the old per-extractor session pattern) plus their messages, since extractors are now pure compute.

2. **`_backfill_strategy_shadows`** — finds the first superuser, then for every `StrategyKnowledge` without a matching `Strategy` shadow doc, inserts one (inactive, `auto_discovered=True`). Older discovery runs without a `user_id` populated only the knowledge side; this step backfills the row the Strategies UI reads.

This module exists because [[Chat-Session Checklist]] "Failure visibility" requires startup orphan reconciliation.

## Depends on

- `StrategyDiscoveryCycle`, `AgentSession`, `AgentSessionMessage`, `StrategyKnowledge`, `Strategy`, `User`

## Used by

- [[Task Scheduler]] — called once during scheduler startup

## See also

- [[_index]]
- [[Task Scheduler]]
- [[Chat-Session Checklist]]
- [[Strategy Auto-Discovery Cycle]]
