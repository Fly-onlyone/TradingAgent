---
tags: [frontend, store, logs, admin]
---

# logStore

> UI state for the admin Log viewer: filter, pagination, auto-refresh toggle, selected log row. `devtools`-wrapped.

## Source

- `frontend/src/store/logStore.ts`

## How it works

Holds a `LogsFilter` (`page`, `pageSize`, plus level/source filters), `autoRefresh: boolean`, and the `selectedLog: LogEntry | null` for the detail panel. `setFilters` always resets to page 1 on filter change. `setPageSize` resets page 1. `toggleAutoRefresh` flips the polling flag that the page reads to enable/disable [[TanStack Query]] `refetchInterval`.

## Used by

- Admin Logs route

## See also

- [[_index]]
- [[Admin Endpoints]]
