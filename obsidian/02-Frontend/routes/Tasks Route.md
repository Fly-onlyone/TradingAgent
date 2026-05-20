---
tags: [frontend, routes]
---

# Tasks Route

> `/tasks` — scheduled trading + monitoring cycles with run-now, pause, and per-section config.

## Source

- `frontend/src/routes/tasks/index.tsx`

## How it works

`requireAuth()` guard. Renders `TaskActionBar`, `TaskStatStrip`, and
`TaskSectionTabs` (Trading / Monitoring / General / Schedule). A `TaskConfigContext`
shares form state across sections. Live progress comes from
`TaskRunningProgress`; `RecentRunsPanel` shows the last N runs. The orphaned-run
recovery hook in the backend (`_mark_orphaned_discovery_cycles_failed`) ensures
no row is stuck on "running" — see [[Chat-Session Checklist]].

## Depends on

- [[Tasks Components]]
- [[taskStore]]

## See also

- [[_index]]
- [[Agent Route]]
