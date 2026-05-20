---
tags: [frontend, theme]
---

# Shadows

> Custom 25-step MUI shadow ladder tuned for dark mode + preset-aware glow effects.

## Source

- `frontend/src/theme/shadows.ts`

## How it works

`shadows` is a `Shadows` tuple (MUI requires exactly 25 entries) using pure black `rgba(0,0,0,...)` at increasing opacity and blur — designed to read on dark backgrounds without the muddy gray MUI defaults.

`createGlowEffects(preset)` returns colored box-shadow strings keyed by the preset's `primaryRgb`/`secondaryRgb`/`semanticRgb`:

- `primary` / `primaryIntense` — small/large primary halo
- `successPulse` / `errorPulse` — semantic pulses with outer falloff
- `cardHover` / `cardActive` — composite drop-shadow + primary glow for cards

Exposed via `theme.trading.glow.*`. `glowTransition = "box-shadow 0.3s ease"` is the canonical transition string.

## Depends on

- [[Theme Presets]]

## Used by

- [[createAppTheme]]
