---
tags: [frontend, routes]
---

# Root Route

> `__root.tsx` — wraps every page in [[AppShell]] and an `ErrorBoundary`.

## Source

- `frontend/src/routes/__root.tsx`

## How it works

`createRootRoute({ component: () => <ErrorBoundary><AppShell><Outlet /></AppShell></ErrorBoundary> })`.
The `ErrorBoundary` is also wired into [[Sentry Frontend]] for production error
capture. `AppShell` decides whether to render chrome (auth pages skip the
header/sidebar) and which pages disable content scrolling.

## Depends on

- [[AppShell]]
- `ErrorBoundary` (`components/common/ErrorBoundary.tsx`)

## Used by

- TanStack route tree (parent of every route)

## See also

- [[_index]]
- [[TanStack File-Based Routing]]
