---
tags: [frontend, theme]
---

# createAppTheme

> Factory that assembles a fully configured MUI `Theme` from a single `ThemePreset`.

## Source

- `frontend/src/theme/createAppTheme.ts`

## How it works

Takes a `ThemePreset`, derives palette / glass styles / gradients / trading colors / glow effects, then calls `createTheme(...)` with the standard MUI slots (palette, typography, shadows, components, shape) plus a custom `trading` namespace augmenting `Theme`. The `trading` slot exposes app-specific tokens (chart series colors, trading bullish/bearish, glow box-shadows, spacing, elevation, primary/secondary/accent RGB triplets) so components can read `theme.trading.glow.primary` etc.

`shape.borderRadius` is driven by `preset.glass.borderRadius`, which differs per preset (Solar 8, Glacier 6, Jade 10, Eclipse 14).

## Depends on

- [[Theme Presets]]
- [[Palette]]
- [[Components Overrides]]
- [[Shadows]]
- [[Typography]]

## Used by

- [[MUI Theme]]

## See also

- [[_index]]
