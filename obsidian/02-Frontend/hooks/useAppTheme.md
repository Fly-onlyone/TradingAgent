---
tags: [frontend, hooks, theme]
---

# useAppTheme

> Reads `themeId` from [[uiStore]] and memoizes the resulting MUI `Theme`.

## Source

- `frontend/src/hooks/useAppTheme.ts`

## How it works

`useMemo(createAppTheme(getPreset(themeId)), [themeId])` — switching theme changes the id in [[uiStore]], rehydrates from `persist`, and rebuilds the MUI theme exactly once. The theme is then passed to `<ThemeProvider>` at the app root.

## Depends on

- [[uiStore]]
- `@/theme/createAppTheme`, `@/theme/presets`

## See also

- [[_index]]
- [[MUI Theme]]
