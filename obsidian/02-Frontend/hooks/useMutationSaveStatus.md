---
tags: [frontend, hooks, mutations]
---

# useMutationSaveStatus

> Derives a `SaveStatus` (`idle | saving | saved | error`) from a TanStack Query mutation's flags, with auto-clear after `clearDelay`.

## Source

- `frontend/src/hooks/useMutationSaveStatus.ts`

## How it works

Watches `mutation.isPending` → `saving`, `isSuccess` → `saved`, `isError` → `error`. Both `saved` and `error` schedule a `setTimeout(setStatus("idle"), clearDelay)` (default 2000ms) so the UI's "Saved!" badge disappears on its own. Use this when the parent already owns the mutation (e.g. a save button); use [[useDebouncedSave]] when you want auto-save with an internal debounce instead.

## Depends on

- [[TanStack Query]] mutation shape

## See also

- [[_index]]
- [[useDebouncedSave]]
