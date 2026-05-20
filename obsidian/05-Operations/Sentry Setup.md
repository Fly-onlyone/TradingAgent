---
tags: [operations]
---

# Sentry Setup

> Separate Sentry projects per layer under org `fly-theonlyone`.

## What it does

- **Backend** project: `trading-agent-backend` — see [[Sentry Backend]]
- **Frontend** project: `trading-agent-frontend` — see [[Sentry Frontend]]
- Source maps uploaded at build time when `SENTRY_AUTH_TOKEN` is set — see [[Sentry Source Maps]]

## Env vars

Documented in `.env.example`:

- Backend: `SENTRY_DSN`
- Frontend: `VITE_SENTRY_DSN`
- Build-time: `SENTRY_AUTH_TOKEN` (CI secret)

When DSN is missing, Sentry init is skipped silently — keeps local dev quiet.

## Gotchas

- Use the right DSN per layer — don't mix backend and frontend DSNs
- Auth token never goes in code or `.env` — only CI secrets

## See also

- [[_index]]
- [[Sentry Backend]]
- [[Sentry Frontend]]
- [[Sentry Test Endpoint]]
