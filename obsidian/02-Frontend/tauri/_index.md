---
tags: [frontend, tauri, moc]
---

# Tauri MOC

> Map of the `frontend/src-tauri/` Tauri v2 desktop shell.

## Source

- `frontend/src-tauri/`

## Members

- [[Tauri v2 Config]] — `tauri.conf.json` (windows, CSP, plugins, bundle)
- [[Sidecar Binary]] — Python backend spawned as a Tauri shell child
- [[Window Setup]] — `src/main.rs` + `src/lib.rs`, tray, window state, shutdown
- [[IPC Commands]] — `frontend_log`, autostart helpers, window prefs
- [[Auto-Updates]] — Tauri updater plugin (not currently enabled)
- [[Capabilities]] — `capabilities/default.json` — where shell/fs/dialog/autostart permissions live
- [[Tauri Env Detection]] — `frontend/src/utils/tauriEnv.ts` runtime check + base URLs

## See also

- [[Tauri v2]]
