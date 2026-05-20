---
tags: [frontend, theme]
---

# Typography

> Inter for UI text, JetBrains Mono for numbers and code.

## Source

- `frontend/src/theme/typography.ts`

## How it works

Static `TypographyOptions` shared across all presets:

- `fontFamily`: `Inter`, falling back to Roboto/Helvetica/Arial.
- Headings `h1`-`h6`: bold/semi-bold with progressively tighter line-heights and negative letter-spacing on the larger sizes.
- `button`: 600 weight, `textTransform: none` (never uppercase by default).
- `overline`: uppercase, wide letter-spacing.
- `monoFontFamily` export: `JetBrains Mono`, then Fira Code/Consolas — exposed on `theme.trading.mono` for price/quantity readouts.

## Used by

- [[createAppTheme]]

## See also

- [[MUI Theme]]
