---
tags: [frontend, components, layout]
---

# NotificationPanel

> Popover anchored under the header bell that lists active + recent notifications, with clear-all.

## Source

- `frontend/src/components/layout/NotificationPanel.tsx`

## How it works

Uses MUI `<Popover anchorReference="anchorPosition">` (already zoom-safe) with
glassmorphic styling pulled from `theme.trading.glass.card`. Merges
`notifications` + `notificationHistory` from [[uiStore]] into a single
`AnimatePresence` list; active items are full opacity with a close button,
history items render at 60% opacity. Empty state shows a muted bell icon.
Entry animation comes from [[staggerCascade]].

## Depends on

- [[uiStore]]
- [[Framer Motion Variants]]
- [[Reduced Motion]]

## Used by

- `Header.tsx`

## See also

- [[Layout Components]]
- [[Notification Service]]
