---
tags: [frontend, theme, zoom]
---

# MuiTooltip Zoom Override

> Global override mirroring [[MuiPopper Zoom Override]] for `<Tooltip>` — keeps tooltip positioning correct under CSS-zoom UI scaling.

## Source

- `frontend/src/theme/components.ts` (`MuiTooltip.styleOverrides`)

## How it works

```ts
MuiTooltip: {
  styleOverrides: {
    popper: { zoom: "var(--ui-zoom-inverse, 1)" },
    tooltip: {
      zoom: "var(--ui-zoom, 1)",
      backgroundColor: `rgba(${surface.tooltip}, 0.9)`,
      backdropFilter: "blur(12px)",
      // ...
    },
    arrow: { color: `rgba(${surface.tooltip}, 0.9)` },
  },
}
```

The `popper` slot is rolled back to unscaled coords (so `getBoundingClientRect()` math inside Popper.js sees real pixels), then the visible `tooltip` slot is re-zoomed. The visual layer also has the standard frosted-glass treatment plus a preset-tinted background. Because this is global, every `<Tooltip>` in the app is zoom-correct without ceremony at the call site.

## Used by

- All [[MUI Theme]] consumers

## See also

- [[MuiPopper Zoom Override]]
- [[CSS Zoom Handling]]
