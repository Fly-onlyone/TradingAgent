---
tags: [frontend, tauri]
---

# Window Setup

> Rust entry-point (`src/main.rs` → `src/lib.rs`) owns window state persistence, tray menu, and shutdown lifecycle.

## Source

- `frontend/src-tauri/src/main.rs`
- `frontend/src-tauri/src/lib.rs`

## How it works

`main.rs` is one line that calls `trading_agent_lib::run()`. `lib.rs` builds
the Tauri app: plugins (log, autostart, shell, dialog, fs), `BackendState`
+ `WindowStateCache` managed states, and a setup callback that restores
geometry from `window-state.json` (validating against connected monitors so
off-screen windows recenter), shows the window if `start_with_window_open`,
spawns the backend, and builds a tray menu (Show / Restart Backend / Run Task
/ Exit). In packaged builds, close → hide-to-tray; `ExitRequested` kills the
backend with the escalation ladder.

## Depends on

- [[Sidecar Binary]]
- `tauri-plugin-log`, `tauri-plugin-autostart`, `tauri-plugin-shell`, `tauri-plugin-dialog`, `tauri-plugin-fs`

## See also

- [[_index]]
- [[IPC Commands]]
