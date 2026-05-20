---
tags: [frontend, components, layout]
---

# AppShell

> Top-level app frame mounted by the [[Root Route]] — header, sidebar, content area, background effects, notifications.

## Source

- `frontend/src/components/layout/AppShell.tsx`

## How it works

Reads `currentPath` via `useRouterState`. Hides chrome on `/auth/*` pages and
suppresses content scroll on `/agent`. Background effects (`MeshBlobs`,
`ParticleGrid`) are `React.lazy`-loaded and only mounted when
`effectsEnabled && !reducedMotion && effectsReady` — `effectsReady` is gated
behind `requestIdleCallback` so the page can paint first. Container height is
`calc(100dvh / var(--ui-zoom, 1))` so layout matches the visual zoom.
Notification toasts mount via `NotificationStack` only when there are active
notifications.

## Depends on

- [[Sidebar]]
- `Header`, `BottomNav`, `NotificationStack`
- [[uiStore]]
- [[Reduced Motion]]

## Used by

- [[Root Route]]

## See also

- [[Layout Components]]
- [[Effects Components]]
