---
tags: [frontend, hooks, zoom]
---

# useUIScaleZoom

> Listens for Ctrl+Wheel and applies the resulting CSS `zoom` to `<html>`. Also writes `--ui-zoom` / `--ui-zoom-inverse` custom properties so manual overrides can compensate.

## Source

- `frontend/src/hooks/useUIScaleZoom.ts`

## How it works

Reads/writes `uiScale` on [[uiStore]] (clamped 0.75–1.5, step 0.05). On every change, sets `document.documentElement.style.zoom` (or removes it at 1.0), updates the two CSS vars, and dispatches `window.resize` so Popper.js / [[useZoomAwareMenu|useZoomAwareMenu]] recompute. The `Ctrl+wheel` listener is `passive: false` to call `preventDefault()`. `visible` is a transient flag (800ms after the last change) used by the on-screen "100%" indicator.

## Used by

- App root layout (called once)

## Gotchas

- Don't read `getBoundingClientRect()` without dividing by `uiScale` — that's the whole reason this exists. See [[CSS Zoom Handling]].

## See also

- [[_index]]
- [[uiStore]]
- [[useZoomAwareMenu]]
