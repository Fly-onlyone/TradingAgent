---
tags: [frontend, utils, tauri]
---

# Autostart

> Toggle "launch on Windows login" via a Start-menu Startup-folder `.lnk` shortcut managed from Rust.

## Source

- `frontend/src/utils/autostart.ts`

## How it works

Invokes Tauri commands (NOT the `tauri-plugin-autostart` registry approach, which had upgrade issues):

- `ensure_startup_shortcut` — create the `.lnk` in `shell:startup`
- `remove_startup_shortcut` — delete it
- `is_startup_shortcut_enabled` — does it exist?

All four exported functions (`enableAutostart`, `disableAutostart`, `isAutostartEnabled`, `syncAutostartPreference`) early-return on `!isTauri()` so they're safe to call from browser dev. As a transition step, each enable/disable also calls the old `@tauri-apps/plugin-autostart` `disable()` to clear stale registry entries from earlier app versions.

`syncAutostartPreference(enabled)` reconciles the saved preference with the OS state on launch — used after app upgrades to restore the shortcut.

## Depends on

- [[Tauri Env Detection]]
- [[Tauri v2]]

## See also

- [[Window Startup]]
