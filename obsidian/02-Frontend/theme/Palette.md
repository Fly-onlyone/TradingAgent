---
tags: [frontend, theme]
---

# Palette

> Factories that map a `ThemePreset` into MUI palette, glass styles, gradients, and trading-specific colors.

## Source

- `frontend/src/theme/palette.ts`

## How it works

Four pure factories driven by a preset:

- `createPalette(preset)` — MUI palette in `dark` mode with primary/secondary/background/text/divider and semantic success/error/warning/info.
- `createTradingColors(preset)` — bullish/bearish/volume/neutral plus their RGB triplets, a grid color, a primary-tinted highlight, and a crosshair.
- `createGlassStyles(preset)` — frosted-glass recipes for `card`, `elevated`, `sidebar`, `header` (background `rgba(...)`, `backdropFilter: blur(...)`, border, borderRadius).
- `createGradients(preset)` — linear/conic gradients including `meshBg` used by the animated mesh background.

All consumers read these via the augmented `theme.trading.*` namespace defined in `theme/index.ts`.

## Depends on

- [[Theme Presets]]

## Used by

- [[createAppTheme]]
- [[Components Overrides]]

## See also

- [[Shadows]]
