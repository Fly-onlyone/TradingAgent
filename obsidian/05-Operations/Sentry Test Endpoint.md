---
tags: [operations]
---

# Sentry Test Endpoint

> `POST /api/v1/admin/sentry-test` — superuser-only endpoint that raises a controlled exception to verify Sentry wiring.

## What it does

- Forces a deliberate exception in the FastAPI request handler
- The handler is caught by [[Sentry Backend]]'s auto-integration and dispatched to the org's `trading-agent-backend` project
- Useful for verifying DSN, environment tags, and release version after deploy

## Setup

- Requires authenticated superuser (`get_current_superuser` dependency)
- Requires `SENTRY_DSN` to be set, otherwise Sentry init is skipped

## Gotchas

- Endpoint is intentionally noisy — call it once per deploy verification, not in CI loops
- Frontend has no equivalent endpoint; trigger a synthetic error in dev tools instead

## See also

- [[_index]]
- [[Sentry Backend]]
- [[Sentry Setup]]
