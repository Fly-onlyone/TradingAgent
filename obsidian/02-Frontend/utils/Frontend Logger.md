---
tags: [frontend, utils, logging]
---

# Frontend Logger

> Forwards browser-side logs (errors, unhandled rejections, console.error, navigation/pageload metrics) to the backend at `POST /api/v1/logs/frontend`.

## Source

- `frontend/src/utils/frontendLogger.ts`

## How it works

`initializeFrontendLogging()` installs:

- `window.error` and `window.unhandledrejection` listeners → `ERROR` level
- `console.error` hook (and optionally `console.warn`, off by default) → forwarded with `frontend.console.error` logger name

`reportFrontendLog(level, message, options)` builds a `FrontendLogPayload` with `page_url`, `user_agent`, optional `traceback`/`extra`, and POSTs JSON with `keepalive: true`. A 1-second dedupe cache keyed on `level:loggerName:message` prevents flood. In Tauri it also calls the `frontend_log` Rust command so messages land in the desktop stdout.

The `POST /logs/frontend` request is wrapped in `runWithoutSentryTracing(...)` so it never spawns a Sentry transaction — this transaction is intentionally dropped to reduce noise.

`WARNING` level is suppressed in production builds.

## Gotchas

- Token-aware: pulls bearer from `getAccessToken()` so backend can attribute logs to a user.

## Depends on

- [[Sentry Frontend]]
- [[Tauri Env Detection]]

## Used by

- [[Performance Metrics]]
