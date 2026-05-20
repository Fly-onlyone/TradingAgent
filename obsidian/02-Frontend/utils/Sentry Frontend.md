---
tags: [frontend, utils, sentry]
---

# Sentry Frontend

> Lazy Sentry loader + thin helper API — keeps Sentry's bundle out of the critical path while still catching early errors.

## Source

- `frontend/src/utils/sentry.ts`

## How it works

`bootstrapObservability()` (called from `main.tsx`) immediately starts loading `@sentry/react` and calls `init(...)` with options from [[Sentry Browser Config]] — Sentry must initialize early to catch startup errors. Non-critical observability ([[Frontend Logger]], [[Performance Metrics]]) is deferred via `requestIdleCallback` so it doesn't compete with first paint.

Public API queues calls until the module loads:

- `captureSentryException(err, ctx)` / `captureSentryMessage(msg, ctx)`
- `setSentryUser(user)`
- `startSentrySpan(opts, cb)` / `startSentrySpanManual(opts, cb)` — manual spans return a no-op span while Sentry is still loading
- `runWithoutSentryTracing(cb)` — wraps `Sentry.suppressTracing`; used by [[Frontend Logger]] so the `/logs/frontend` POST never spawns its own Sentry transaction
- `reportReactRenderError(err, info)` — for `<ErrorBoundary>` integration

## Depends on

- [[Sentry Browser Config]]
- [[Tauri Env Detection]]

## Used by

- `main.tsx`, [[Frontend Logger]], [[Performance Metrics]]
