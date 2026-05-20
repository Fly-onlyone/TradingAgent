---
tags: [frontend, theme, zoom]
---

# MuiPopper Zoom Override

> Global theme override that unwinds the app's CSS `zoom` on `MuiPopper`, then re-applies it to children — so Selects, Menus, autocompletes, etc. position correctly under UI scaling.

## Source

- `frontend/src/theme/components.ts` (`MuiPopper.styleOverrides.root`)

## How it works

```ts
MuiPopper: {
  styleOverrides: {
    root: {
      zoom: "var(--ui-zoom-inverse, 1)",
      "& > *": { zoom: "var(--ui-zoom, 1)" },
    },
  },
}
```

The outer popper is moved into "unscaled" coordinate space so Popper.js / floating-ui anchor math works against the real DOM rect. The immediate child (paper/menu) is then re-zoomed so it visually matches the rest of the app. This lets every `<Select>`, `<Menu>`, autocomplete, and tooltip dropdown work without per-component fixes — provided the dropdown is anchored by an `anchorEl` Popper, not a hand-rolled `getBoundingClientRect()` math.

## Gotchas

- Components that compute coordinates manually (mouse/cursor effects, custom popovers) must still divide by `uiScale` — see [[CSS Zoom Handling]].
- Don't remove the `& > *` rule — without it the dropdown renders at `1/uiScale` size.

## Used by

- All [[MUI Theme]] consumers

## See also

- [[MuiTooltip Zoom Override]]
- [[ZoomAwareSelect]]
- [[useZoomAwareMenu]]
- [[useUIScaleZoom]]
