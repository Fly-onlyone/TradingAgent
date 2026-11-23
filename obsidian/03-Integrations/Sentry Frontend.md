---
tags: [integrations]
---

# Sentry Frontend

> [!warning] Project deleted
> The Sentry project `trading-agent-frontend` was deleted on 2026-11-23. The frontend sends nothing unless a new
> project is created and its DSN set. This note is kept as a record of how the integration works.

> Error monitoring for the React frontend — project `trading-agent-frontend` under org `fly-theonlyone`.

## Used for

- Capturing unhandled React errors via `Sentry.ErrorBoundary` (wraps the tree in `main.tsx`)
- Browser performance traces
- Source-mapped stack traces (see [[Sentry Source Maps]])

## Configuration

- `@sentry/react` package
- Conditional init when `VITE_SENTRY_DSN` is set
- ErrorBoundary configured in `frontend/src/main.tsx`

## Gotchas

- DSN missing = Sentry is silently disabled

## See also

- [[_index]]
- [[Sentry Backend]]
- [[Sentry Source Maps]]
