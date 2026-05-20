---
tags: [frontend, tauri]
---

# IPC Commands

> Custom Rust commands callable from the frontend via `@tauri-apps/api/core` `invoke()`.

## Source

- `frontend/src-tauri/src/lib.rs` (`#[tauri::command]` blocks + `tauri::generate_handler!`)

## Registered commands

- `frontend_log(level, message)` — pipes frontend logs into the Rust `log` crate (which `tauri-plugin-log` writes to stdout + file)
- `get_start_with_window_open()` / `set_start_with_window_open(enabled)` — persisted in `window-state.json`
- `ensure_startup_shortcut()` / `remove_startup_shortcut()` / `is_startup_shortcut_enabled()` — Windows-only, manages a `.lnk` in the user's Startup folder via `mslnk`

## How it works

The frontend calls `invoke("frontend_log", { level, message })` etc. through a
small wrapper that no-ops when [[Tauri Env Detection]] reports browser mode.
Commands are registered via `tauri::generate_handler![...]` in the builder.

## Depends on

- [[Capabilities]] (`core:default`)
- [[Tauri Env Detection]]

## See also

- [[_index]]
- [[Window Setup]]
