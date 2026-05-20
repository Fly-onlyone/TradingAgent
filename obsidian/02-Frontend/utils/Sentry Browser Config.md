---
tags: [frontend, utils, sentry]
---

# Sentry Browser Config

> Pure functions that build Sentry init options from `import.meta.env` — fully testable, no side effects.

## Source

- `frontend/src/utils/sentryConfig.ts`

## How it works

Helpers parse `VITE_SENTRY_*` env vars:

- `isFrontendSentryConfigured(env)` — DSN present?
- `getFrontendSentryTracingSampleRate(env)` — defaults to `0.1`, clamped to `[0, 1]`
- `isFrontendSentryTracingEnabled(env)` — DSN + rate > 0
- `getFrontendSentryEnvironment(env)` — explicit `VITE_SENTRY_ENVIRONMENT` else `development`/`production` from `env.DEV`
- `getFrontendSentryRelease(env)`, `isFrontendSentryLogsEnabled(env)` (default on)
- `getFrontendSentryTracePropagationTargets(env, apiBaseUrl)` — always includes `/^\/api\/v1/` + the resolved API base

`createFrontendSentryInitOptions(env, apiBaseUrl, integrationsFactories)` assembles a `BrowserOptions` ready for `Sentry.init(...)`, attaching `browserTracingIntegration` and (when logs enabled) `consoleLoggingIntegration`.

## Used by

- [[Sentry Frontend]]

## See also

- [[Frontend Logger]]
