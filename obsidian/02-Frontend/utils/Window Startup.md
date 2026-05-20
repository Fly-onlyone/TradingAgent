---
tags: [frontend, utils, tauri]
---

# Window Startup

> Toggle the "open main window on launch" preference (vs. starting hidden to the tray).

## Source

- `frontend/src/utils/windowStartup.ts`

## How it works

Two Tauri command invocations:

```ts
getWindowStartupConfig() -> { enabled: boolean }   // invoke("get_start_with_window_open")
setWindowStartupConfig(enabled) -> ...             // invoke("set_start_with_window_open", { enabled })
```

Pairs with [[Autostart]] — `autostart` controls *whether* the app launches at login; this controls *whether* the launched app shows its window or stays minimized to the tray. Both early-return safely outside Tauri (`!isTauri()` → identity behavior so React state setters don't break in dev browser).

## Depends on

- [[Tauri Env Detection]]
- [[Tauri v2]]

## See also

- [[Autostart]]
