---
tags: [frontend, theme]
---

# Theme Presets

> Four full design systems — Solar, Glacier, Jade, Eclipse — selectable at runtime.

## Source

- `frontend/src/theme/presets.ts`

## How it works

Each `ThemePreset` declares the entire visual vocabulary: primary/secondary/accent colors (hex + RGB triplet), backgrounds, text, surface tints, scrollbar colors, semantics, trading colors, borders, interactive states, chart series, status colors, gradient accents, glass parameters (borderRadius/blur/opacity), animation tunings (`fast`/`normal`/`slow` durations + `spring.snappy`/`bouncy`/`gentle` configs + easing curves + mesh-blob counts/cycles), spacing, and elevation shadows.

```ts
export type ThemeId = "solar" | "glacier" | "jade" | "eclipse";
export function getPreset(id: ThemeId): ThemePreset;
export const themeList: ThemePreset[];
```

Solar is orange/purple (default), Glacier is cyan/sky, Jade is emerald/teal, Eclipse is violet/pink.

## Used by

- [[createAppTheme]]
- [[Palette]]
- [[Components Overrides]]
- [[Shadows]]

## See also

- [[MUI Theme]]
