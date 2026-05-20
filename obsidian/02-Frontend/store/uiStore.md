---
tags: [frontend, store, ui]
---

# uiStore

> Cross-cutting UI state: sidebar, theme id, reduced-motion, effects toggle, **`uiScale`**, in-app notifications, modals, backend status.

## Source

- `frontend/src/store/uiStore.ts`

## How it works

`uiScale` is the CSS-zoom factor (clamped 0.75–1.5) read by every zoom-aware component — see [[CSS Zoom Handling]]. `addNotification` auto-removes after `duration` (default 5s), records into a 50-item `notificationHistory`, and fires a native OS toast when `document.hidden` and the type is error/success. `backendStatus` (`connecting` | `online` | `offline`) is checked by [[useRecoverableQueryState|useRecoverableQueryState]] to suppress transient errors. `persist` keeps sidebar, theme, motion prefs, and `uiScale` only. The `notify.{success,error,warning,info}` helpers are the canonical toast API.

## Used by

- [[useZoomAwareMenu]], [[useUIScaleZoom]], [[ZoomAwareSelect]], [[ZoomAwareAutocomplete]]
- [[useAppTheme]] (reads `themeId`)
- [[useRecoverableQueryState]] (reads `backendStatus`)

## See also

- [[_index]]
- [[CSS Zoom Handling]]
- [[MUI Theme]]
