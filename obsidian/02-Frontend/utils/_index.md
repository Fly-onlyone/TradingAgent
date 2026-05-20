---
tags: [frontend, utils, moc]
---

# Utils MOC

> Map of contents for `frontend/src/utils/` — cross-cutting helpers: validation, transforms, errors, constants, observability, Tauri bridges, performance metrics, logging.

## Source

- `frontend/src/utils/`

## Notes

- [[Validators]] — Zod schemas for auth/strategies/settings
- [[Transformers]] — number/timestamp coercion + snake_case→camelCase via endpoint files
- [[Errors]] — `getErrorMessage()` extractor
- [[Constants]] — API base, pagination, trading defaults, shortcuts
- [[Sentry Browser Config]] — pure env-driven Sentry init options
- [[Sentry Frontend]] — lazy Sentry loader + helper API
- [[Tauri Env Detection]] — `isTauri()`, `getApiBaseUrl()`, `getWsUrl()`
- [[Autostart]] — Windows startup shortcut bridge
- [[Native Notifications]] — Web Notification API wrapper
- [[Window Startup]] — start-with-window-open setting
- [[Performance Metrics]] — page-load and route-transition timings
- [[Frontend Logger]] — forwards logs to backend `/logs/frontend`

## See also

- [[Tauri v2]]
- [[Sidecar Binary]]
