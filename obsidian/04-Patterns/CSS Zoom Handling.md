---
tags: [pattern]
---

# CSS Zoom Handling

> Any frontend component using MUI Select, Menu, popovers, or mouse coords must compensate for the app's CSS `zoom` UI scaling.

## When to apply

Any new component that uses `getBoundingClientRect()` for positioning, `e.clientX/Y` for mouse logic, or MUI's `anchorEl`-based portals — these break under CSS `zoom`.

## The pattern

| Case | Solution |
|---|---|
| MUI `<Select>` | [[ZoomAwareSelect Pattern]] (drop-in) |
| MUI `<Menu>` | [[useZoomAwareMenu Pattern]] |
| Manual popover | Divide rect coords by `uiScale` |
| Mouse position | Divide `e.clientX/Y` by `uiScale` |
| Framer MotionValue cursor | `useTransform(x, v => v / uiScale)` before `useSpring` |

CSS vars `--ui-zoom` and `--ui-zoom-inverse` are available globally.

## Why

CSS `zoom` makes `getBoundingClientRect()` return scaled coordinates, but MUI portals position relative to unscaled viewport — the popover lands in the wrong spot.

## Don't

- Don't use plain MUI `<Select>` or `anchorEl`-based `<Menu>`
- Don't read `getBoundingClientRect()` without dividing by `uiScale`

## See also

- [[_index]]
- [[ZoomAwareSelect Pattern]]
- [[useZoomAwareMenu Pattern]]
