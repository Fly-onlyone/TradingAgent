---
tags: [integrations]
---

# Sentry Backend

> Error monitoring for the FastAPI backend — project `trading-agent-backend` under org `fly-theonlyone`.

## Used for

- Unhandled exception capture
- Structured log forwarding (ERROR+ as events, INFO+ as breadcrumbs) via `LoggingIntegration`
- FastAPI auto-integration (request context, transactions)

## Configuration

- `sentry-sdk[fastapi]>=2.0.0`
- Conditional init when `SENTRY_DSN` env var is set
- Test endpoint: `POST /api/v1/admin/sentry-test` (superuser-only)
- See `.env.example` for required env vars

## Gotchas

- DSN missing = Sentry is silently disabled (intentional — keeps dev quiet)

## See also

- [[_index]]
- [[Sentry Frontend]]
- [[Sentry Setup]]
- [[Sentry Test Endpoint]]
