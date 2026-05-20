---
tags: [integrations]
---

# Vite

> Frontend build tool and dev server.

## Used for

- React + TypeScript dev server (`bun run dev`, port 3000)
- Production builds (`vite build && tsc`)
- TanStack Router file-based route tree generation via `@tanstack/router-plugin` (auto-generated, no manual CLI run needed)
- [[Sentry Source Maps]] upload via `@sentry/vite-plugin` at build time

## Configuration

- `vite>=7.1.7`
- Config: `frontend/vite.config.ts`
- Context7 ID: `/vitejs/vite`

## See also

- [[_index]]
- [[TanStack Router]]
- [[Sentry Source Maps]]
