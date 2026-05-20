---
tags: [frontend, store, pattern]
---

# Zustand Stores Pattern

> Each store lives at `frontend/src/store/xxxStore.ts`, exports `useXxxStore`, and pairs the slice with action methods.

## Source

- `frontend/src/store/*.ts`
- Barrel: `frontend/src/store/index.ts`

## How it works

Stores are created with `create<State>()((set, get) => ({...}))`. Action functions mutate state via `set`; the third `set` arg (action name string) is used when the store wraps with `devtools` middleware so DevTools shows labeled actions (see [[tradeStore]], [[logStore]], [[discoveryStore]]). Stores that must survive reloads wrap with `persist(...)` + a `partialize` selector that picks only safe-to-rehydrate fields (auth token, theme, watchlist) — runtime caches are NOT persisted. `setAccessToken` is called from `onRehydrateStorage` so the axios client picks up the JWT before the first request.

## Used by

- All [[02-Frontend/routes/_index|route pages]] and components

## See also

- [[_index]]
- [[Zustand]]
