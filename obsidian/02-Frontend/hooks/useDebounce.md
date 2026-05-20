---
tags: [frontend, hooks, utility]
---

# useDebounce

> Returns a value that lags behind its input by `delay` ms — classic search/filter debounce.

## Source

- `frontend/src/hooks/useDebounce.ts`

## How it works

`useEffect` schedules a `setTimeout` on every `value` change and clears the previous one on cleanup. The hook returns the latest committed `debouncedValue`. Use for free-text search inputs that drive [[TanStack Query]] keys — feed the debounced value into the query key so you don't refetch on every keystroke.

## See also

- [[_index]]
- [[useDebouncedSave]]
