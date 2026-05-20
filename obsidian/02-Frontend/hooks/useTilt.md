---
tags: [frontend, hooks, motion]
---

# useTilt

> 3D parallax tilt for cards. Returns a Framer Motion `style` (with rotateX/Y/scale springs) plus `onMouseMove` / `onMouseLeave` handlers.

## Source

- `frontend/src/hooks/useTilt.ts`

## How it works

Uses `useMotionValue` + `useSpring` (300/30 stiffness/damping) so updates bypass React re-renders. On move, `(e.clientX - rect.left) / rect.width` produces a 0..1 normalized position used to interpolate `[+maxTilt, -maxTilt]` rotation — this ratio math is **zoom-safe** because numerator and denominator are both in screen pixels. On leave, all motion values spring back to center.

## Gotchas

- The ratio formula is intentionally zoom-safe — do NOT add `/ uiScale` divisions here.

## See also

- [[_index]]
- [[useMagneticHover]]
- [[Framer Motion Variants]]
