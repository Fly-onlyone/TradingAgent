---
tags: [frontend, animations, moc]
---

# Animations MOC

> Map of contents for Framer Motion animation variants and helpers — all centralized in `utils/animations/`. Reuse named variants; never invent ad-hoc spring values.

## Source

- `frontend/src/utils/animations/variants.ts`
- `frontend/src/utils/animations/hooks.ts`
- `frontend/src/utils/animations/particleEngine.ts`

## Variants

- [[Spring Configs]] — `snappy`, `bouncy`, `gentle`
- [[pageEntrance]] — full page/route entry (opacity + y + scale)
- [[pageInstant]] — 100ms opacity fade for cheap pages
- [[staggerCascade]] — grid container + item (0.08s stagger, y+scale)
- [[listStagger]] — table rows (0.03s stagger, x-axis)
- [[scaleIn]] — modal / dialog (0.85 → 1 scale)
- [[slideIn]] — `left` / `right` / `bottom` panel entries
- [[scrollReveal]] — `up` / `down` / `left` / `right` scroll-triggered
- [[createCardHover]] — hover/tap interactive card factory (takes `primaryRgb`)
- [[fadeInUp]] — single-element entry, uses `spring.gentle`
- [[tabSwitch]] — AnimatePresence between tab panels
- [[Reduced Motion]] — `useReducedMotion()` hook + `reducedMotionPage` variant

## Helpers

- [[Animation Hooks]] — `useReducedMotion`, `usePageVisibility`
- [[Particle Engine]] — canvas connected-particles background

## See also

- [[Framer Motion Variants]]
- [[MUI Theme]]
