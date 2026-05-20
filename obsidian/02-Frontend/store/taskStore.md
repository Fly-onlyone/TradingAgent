---
tags: [frontend, store, tasks]
---

# taskStore

> Minimal UI store holding only the currently selected task id on the Tasks page.

## Source

- `frontend/src/store/taskStore.ts`

## How it works

One field: `selectedTaskId: string | null`. Setter + `reset()`. The task list itself is owned by [[TanStack Query]] (so cache invalidation works on `data_event: tasks`); this store just remembers which row is highlighted/expanded across re-renders without driving TanStack into a refetch.

## Used by

- Tasks route page

## See also

- [[_index]]
- [[TanStack Query]]
