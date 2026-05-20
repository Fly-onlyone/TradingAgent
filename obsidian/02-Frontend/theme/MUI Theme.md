---
tags: [frontend, theme]
---

# MUI Theme

> Top-level entry point that wires presets + factories together and augments the MUI `Theme` type with a `trading.*` namespace.

## Source

- `frontend/src/theme/index.ts`

## How it works

1. `declare module "@mui/material/styles"` adds `trading: { colors, glass, gradients, glow, mono, animations, primaryRgb, secondaryRgb, accentRgb, semanticRgb, border, interactive, chart, status, cardTint, gradientAccent, sectionGlow, spacing, elevation }` to both `Theme` and `ThemeOptions`.
2. Exports `theme = createAppTheme(getPreset("solar"))` as the default (backward-compat for code that imports `theme` directly).
3. Re-exports `createAppTheme`, `themeList`, `themePresets`, `getPreset`, `shadows`, `typography`, `monoFontFamily`, and the `ThemeId` / `ThemePreset` types.

Consumers read theme-aware values via `theme.trading.glow.primary`, `theme.trading.colors.bullish`, etc., everywhere — never hardcoded.

## Depends on

- [[createAppTheme]]
- [[Theme Presets]]
- [[Palette]]
- [[Components Overrides]]
- [[Shadows]]
- [[Typography]]

## See also

- [[_index]]
- [[CSS Zoom Handling]]
