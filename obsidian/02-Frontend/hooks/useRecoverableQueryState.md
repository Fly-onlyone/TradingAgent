---
tags: [frontend, hooks, queries]
---

# useRecoverableQueryState

> Wraps a TanStack Query so transient errors during backend reconnect don't show in the UI. Returns `{ isLoading, isRecovering, showError }`.

## Source

- `frontend/src/hooks/useRecoverableQueryState.ts`

## How it works

Subscribes to `backendStatus` from [[uiStore]]. When status flips `→ online` and the query is currently in error, it auto-`refetch()`s (unless `retryOnReconnect: false`). `isRecovering` is true whenever the query errored AND the backend is not online or the query is fetching. `showError` is true only when the backend is online, fetching is done, and we still have no data — i.e. a real terminal error. `isLoading` covers initial pending + first-time recovery.

## Depends on

- [[uiStore]] (`backendStatus`)

## See also

- [[_index]]
- [[TanStack Query]]
