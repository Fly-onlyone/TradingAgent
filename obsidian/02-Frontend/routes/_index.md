---
tags: [frontend, routes, moc]
---

# Routes MOC

> Map of `frontend/src/routes/` — TanStack file-based routing.

## Source

- `frontend/src/routes/`

## Members

- [[Root Route]] — `__root.tsx`, wraps children in ErrorBoundary + AppShell
- [[Dashboard Route]] — `/`
- [[Agent Route]] — `/agent`
- [[Trading Route]] — `/trading`
- [[Orders Route]] — `/orders`
- [[Trades Route]] — `/trades`
- [[Strategies Routes]] — `/strategies`, `/strategies/create`
- [[Knowledge Route]] — `/knowledge`
- [[Memory Route]] — `/memory`
- [[News Route]] — `/news`
- [[Tasks Route]] — `/tasks`
- [[Settings Route]] — `/settings`
- [[Auth Routes]] — `/auth/{login,register,forgot-password,reset-password,verify-email}`
- [[Admin Routes]] — `/admin/{database,backup,logs,data-management}`
- [[Route Guards]] — `-guards.ts`: `requireAuth`, `requireGuest`, `requireAdmin`
- [[TanStack File-Based Routing]] — auto-generation via vite plugin

## See also

- [[Sidebar]]
- [[AppShell]]
