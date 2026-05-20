---
tags: [frontend, utils]
---

# Errors

> One-liner: pluck a usable message string out of any `unknown` thrown / rejected value.

## Source

- `frontend/src/utils/errors.ts`

## How it works

```ts
export function getErrorMessage(error: unknown, fallback = "Request failed"): string;
```

Inspects `error` for FastAPI-style `detail` first (since axios `error.response.data.detail` is the common case after the API client extracts `.data`), then `message`, finally returns the fallback. Trims whitespace and skips empty strings on each branch.

Used everywhere a TanStack Query / Zustand store / form submit handler needs a `toast(getErrorMessage(err))` line — keeps every error-handler one short call instead of repeating the `typeof === "object" && "detail" in` pattern.

## Used by

- TanStack Query `onError`, Zustand stores, form submit handlers

## See also

- [[_index]]
