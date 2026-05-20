---
tags: [frontend, hooks, mutations]
---

# useDebouncedSave

> Debounced auto-save: call `triggerSave(value)` on every input change; mutation fires after `delay` ms. Tracks lifecycle `idle → pending → saving → saved → idle`.

## Source

- `frontend/src/hooks/useDebouncedSave.ts`

## How it works

Internal `timerRef` reschedules the save on every `triggerSave` call; flips status to `pending` immediately so the UI can show "Saving...". When the timer fires it awaits `mutationFnRef.current(value)`, sets `saved` (or `error`), then resets to `idle` after `savedDuration` (default 2000ms). `cancel()` clears both timers. The mutation fn is kept in a ref so changing closures don't reset the debounce. Pairs with [[useMutationSaveStatus]] for the inverse pattern (status derived from an existing TanStack mutation).

## Used by

- Settings forms that want "auto-save on idle" UX

## See also

- [[_index]]
- [[useMutationSaveStatus]]
