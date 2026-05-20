---
tags: [frontend, components, common, css-zoom]
---

# ZoomAwareSelect

> Drop-in replacement for MUI `<Select>` whose dropdown menu anchors correctly under the app-wide CSS `zoom`.

## Source

- `frontend/src/components/common/ZoomAwareSelect.tsx`

## How it works

Wraps `<Select>` inside a `<Box ref={anchorRef}>` and feeds it the `menuProps`
returned by [[useZoomAwareMenu]]. The hook reads the anchor's
`getBoundingClientRect()` and divides the coordinates by `uiScale` from
[[uiStore]] before passing them to MUI as an `anchorReference: "anchorPosition"`
menu — that bypasses MUI's internal `anchorEl`-based math, which is what breaks
under CSS zoom. The user keeps the full MUI `SelectProps<Value>` API; only menu
positioning is intercepted.

## Depends on

- [[useZoomAwareMenu]]
- [[uiStore]]

## Used by

- [[ChatInput]] (when used via Select), all forms across [[Settings Route]], [[Tasks Route]], [[Strategies Routes]]

## Gotchas

- Never use plain MUI `<Select>` — Biome / the `zoom-aware-check` skill flags it.
- `fullWidth` defaults to `true`.

## See also

- [[CSS Zoom Handling]]
- [[ZoomAwareAutocomplete]]
