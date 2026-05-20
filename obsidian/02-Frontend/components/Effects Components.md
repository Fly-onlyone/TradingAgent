---
tags: [frontend, components, effects]
---

# Effects Components

> Background visuals and micro-interactions. All gated by `effectsEnabled` in [[uiStore]] and [[Reduced Motion]].

## Source

- `frontend/src/components/effects/`

## Members

- `MeshBlobs.tsx` — soft gradient blobs animated behind the shell
- `ParticleGrid.tsx` — sparse particle field tinted by `theme.trading.primaryRgb`
- `MagneticButton.tsx` — button that follows cursor via `useMagneticHover`
- `AnimatedGradientBorder.tsx` — animated conic-gradient border wrapper
- `RollingDigits.tsx` — odometer-style number transitions
- `ScrollReveal.tsx` — wraps children in [[scrollReveal]] variants
- `Sparkline.tsx` — tiny inline price sparkline

## Gotchas

- All effects components are lazy-loaded by [[AppShell]] via `React.lazy` + idle callback.
- Cursor-following effects must divide `e.clientX/Y` by `uiScale` — see [[CSS Zoom Handling]].

## Depends on

- [[useMagneticHover]]
- [[useTilt]]
- [[uiStore]]

## See also

- [[_index]]
