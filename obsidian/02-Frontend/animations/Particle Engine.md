---
tags: [frontend, animations]
---

# Particle Engine

> ~3kb canvas particle system — drifting points connected by lines when close. Used for ambient login/landing backdrops.

## Source

- `frontend/src/utils/animations/particleEngine.ts`

## How it works

Three pure helpers operate on a flat `Particle[]`:

- `createParticles(w, h, count, speed)` — seeds random positions/velocities
- `updateParticles(particles, w, h, dt)` — integrates positions with delta-time normalization (capped 2x), dampens velocity 0.99, wraps around edges
- `drawParticles(ctx, particles, w, h, config)` — clears canvas, draws lines between particles within `lineDistance` (opacity falloff by distance), then fills circles

`DEFAULT_CONFIG` is 130 particles, 180px line distance, primary RGB color. The engine is theme-agnostic — pass `color` as an RGB triplet string so it matches the active [[MUI Theme]] preset.

Render loop lives in the consuming component (typically a hook that grabs `requestAnimationFrame`).

## See also

- [[Animation Hooks]]
