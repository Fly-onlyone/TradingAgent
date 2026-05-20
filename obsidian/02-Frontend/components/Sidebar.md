---
tags: [frontend, components, layout]
---

# Sidebar

> Permanent MUI drawer that auto-expands on hover, collapses to icons, with a `navGroups` array for main nav and a separate `adminGroup` for admin links.

## Source

- `frontend/src/components/layout/Sidebar.tsx`

## How it works

`navGroups: NavGroup[]` defines Core / Monitor / Intelligence / System sections
as data — adding a route means editing this array, never rewiring JSX.
`adminGroup` is a peer constant rendered only when `user.isSuperuser` (or in
dev). Pin state lives in [[uiStore]] (`sidebarState`); hover expansion is local
state. Each item is a `Link` from `@tanstack/react-router` with `preload=false`;
`navigationPreload.ts` prefetches the target chunk on hover via `markNavStart`.
Tooltips show the label when collapsed.

## Depends on

- [[authStore]]
- [[uiStore]]
- [[Framer Motion Variants]] (`spring.snappy` for pin icon)

## Used by

- [[AppShell]]

## Gotchas

- New top-level routes must be added to the matching `navGroups` entry (or `adminGroup` for admin pages).

## See also

- [[Layout Components]]
- [[Route Guards]]
