---
tags: [integrations]
---

# Sentry Frontend

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
