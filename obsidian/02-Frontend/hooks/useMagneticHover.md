---
tags: [frontend, hooks, motion]
---

# useMagneticHover

> Element gently attracts toward the cursor within `radius` px. Returns Framer Motion `style` (translate springs) + mouse handlers.

## Source

- `frontend/src/hooks/useMagneticHover.ts`

## How it works

Computes the element's center from `getBoundingClientRect()` and the vector from cursor to center. If the cursor is within `radius`, it sets `x.set(dx * strength)` / `y.set(dy * strength)` — both fed through `useSpring` (200/20) so motion is fluid without re-rendering. On leave the values spring back to 0.

## Gotchas

- Uses raw `e.clientX/Y` and `rect.*` without dividing by `uiScale`. The translation is in screen pixels, so the magnetic pull will appear stronger at zoom > 1. Acceptable for purely decorative use; not safe for popover positioning — use [[useZoomAwareMenu]] instead.

## See also

- [[_index]]
- [[useTilt]]
