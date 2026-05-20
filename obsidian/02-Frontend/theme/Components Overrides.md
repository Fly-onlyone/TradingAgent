---
tags: [frontend, theme]
---

# Components Overrides

> Per-component MUI overrides — buttons, cards, drawers, tooltips, tabs, alerts, scrollbars, keyframes.

## Source

- `frontend/src/theme/components.ts`

## How it works

`createComponents(preset, glassStyles)` returns the `Components<Theme>` slot for `createTheme(...)`:

- **`MuiCssBaseline`** — installs global `@keyframes` (`shimmer`, `gradientFlow`, `gradientBorderSpin`, `meshDrift`, `glowPulse`, `toastCountdown`), thin custom scrollbars, and the `--gradient-angle` CSS `@property`.
- **`MuiButton`** — glass gradient contained variant with hover lift + active scale-down, preset-aware focus ring.
- **`MuiCard`** / **`MuiPaper`** — glass background, top-edge gradient accent that animates `gradientFlow` on hover.
- **`MuiTooltip`** + **`MuiPopper`** — apply `zoom: var(--ui-zoom-inverse, 1)` to the popper and re-apply `zoom: var(--ui-zoom, 1)` to children, so popovers stay zoom-correct.
- **`MuiAlert`** — frosted-glass filled variants with semantic left border + colored glow.
- **`MuiTab`** — custom underline indicator via `::after` (the real `MuiTabs.indicator` is hidden).

## Depends on

- [[Theme Presets]]
- [[Palette]]

## Used by

- [[createAppTheme]]

## See also

- [[MuiPopper Zoom Override]]
- [[MuiTooltip Zoom Override]]
- [[CSS Zoom Handling]]
