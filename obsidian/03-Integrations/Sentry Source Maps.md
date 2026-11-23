---
tags: [integrations]
---

# Sentry Source Maps

> [!warning] No longer active
> The upload step was removed from `frontend/vite.config.ts` on 2026-11-23, when the Sentry project
> `trading-agent-frontend` was deleted. This note is kept as a record.

> Build-time upload of frontend source maps to Sentry for readable stack traces.

## Used for

- Mapping minified production stack traces back to source files in [[Sentry Frontend]]

## Configuration

- `@sentry/vite-plugin` runs during `vite build`
- Activated only when `SENTRY_AUTH_TOKEN` env var is set at build time
- Org and project configured inline in `vite.config.ts`

## Gotchas

- Missing auth token = build still succeeds but no maps are uploaded (silent)
- Do not commit the auth token — it lives in CI secrets

## See also

- [[_index]]
- [[Sentry Frontend]]
- [[Vite]]
