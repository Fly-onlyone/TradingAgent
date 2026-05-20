---
tags: [integrations]
---

# Sentry Source Maps

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
