---
tags: [frontend, animations]
---

# Animation Hooks

> Two React hooks that animations depend on: `useReducedMotion()` and `usePageVisibility()`.

## Source

- `frontend/src/utils/animations/hooks.ts`

## How it works

**`useReducedMotion(): boolean`** — combines two signals:

1. `useUIStore((s) => s.reducedMotion)` — in-app preference toggle from [[uiStore]]
2. `matchMedia("(prefers-reduced-motion: reduce)").matches` — OS-level accessibility setting

Returns `true` if either is set; consumers swap to `reducedMotionPage` or `duration: 0` variants.

**`usePageVisibility(): boolean`** — subscribes to `document.visibilitychange` and exposes `!document.hidden`. Used by polling hooks (TanStack Query `refetchInterval`, particle render loops, WebSocket keepalives) to pause work when the tab is hidden and resume on return.

Both hooks SSR-safely no-op when `document`/`window` are undefined.

## Used by

- [[Reduced Motion]]
- [[Particle Engine]]
- Any component with `refetchInterval` or animation loops

## See also

- [[uiStore]]
