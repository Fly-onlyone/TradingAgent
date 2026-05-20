---
tags: [frontend, components, layout]
---

# Layout Components

> Top-level chrome wrapping every authenticated page.

## Source

- `frontend/src/components/layout/`

## Members

- [[AppShell]] — root frame, mounts header / sidebar / content / notifications
- [[Sidebar]] — pinned/hover drawer with `navGroups` + `adminGroup` arrays
- `Header.tsx` — top toolbar with notification bell, theme, zoom controls
- `BottomNav.tsx` — mobile bottom navigation
- [[NotificationPanel]] — popover listing active + history notifications
- `NotificationStack.tsx` — stacked toast renderer (active notifications only)
- `navigationPreload.ts` — preloads route chunks on hover

## Depends on

- [[uiStore]]
- [[authStore]]
- [[useAppTheme]]
- [[Framer Motion Variants]]

## See also

- [[_index]]
- [[Route Guards]]
