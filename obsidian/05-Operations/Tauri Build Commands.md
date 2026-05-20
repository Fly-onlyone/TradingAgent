---
tags: [operations]
---

# Tauri Build Commands

> Commands for the desktop shell ([[Tauri v2]]).

## What it does

| Task | Command |
|---|---|
| Desktop dev | `cd frontend && bun run tauri:dev` |
| Desktop build | `cd frontend && bun run tauri:build` |
| Managed dev (concurrent) | `cd frontend && bun run dev:tauri-managed` |

## Setup (Windows)

- Rust (`cargo`) available in PATH: `%USERPROFILE%\.cargo\bin`
- Visual Studio 2022 Build Tools with C++ workload (`MSVC v143` + Windows SDK)

## Tauri v2 config notes

- Do NOT use `plugins.shell.scope` in `tauri.conf.json` (removed in v2)
- Keep `plugins.shell` minimal (e.g. `open`)
- Put shell command permissions in `frontend/src-tauri/capabilities/default.json`

## Gotchas

- First build is slow (Rust compile)
- Backend sidecar must be built before `tauri:build` — see `build:backend-sidecar` script

## See also

- [[_index]]
- [[Tauri v2]]
- [[Sidecar Binary]]
