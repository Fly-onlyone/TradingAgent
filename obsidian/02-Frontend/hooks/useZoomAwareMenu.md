---
tags: [frontend, hooks, zoom]
---

# useZoomAwareMenu

> Drop-in replacement for `anchorEl`-based MUI `<Menu>` that survives the app-wide CSS `zoom`. Required by [[CSS Zoom Handling]].

## Source

- `frontend/src/hooks/useZoomAwareMenu.ts`

## How it works

Returns `{ anchorRef, open, handleOpen, handleClose, menuProps }`. On open, it reads `anchorRef.current.getBoundingClientRect()` and divides `top`/`left`/`width` by `uiScale` from [[uiStore]] — because the browser reports zoomed coordinates that MUI's anchor logic doesn't know about. It also auto-flips above the trigger when there's < 160px below the viewport, swapping `transformOrigin`. `menuProps` plugs into MUI `<Menu>` with `anchorReference: "anchorPosition"` and a `marginThreshold: -Infinity` to prevent further re-positioning.

## Used by

- [[useAgentConfigMenus]]
- All admin dropdown buttons

## Gotchas

- The trigger element MUST attach `anchorRef` to the wrapper, not the inner button — width matching expects the rect of the visible row.

## See also

- [[_index]]
- [[CSS Zoom Handling]]
- [[useUIScaleZoom]]
