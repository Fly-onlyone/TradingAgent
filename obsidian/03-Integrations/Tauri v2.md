---
tags: [integrations]
---

# Tauri v2

> Cross-platform desktop shell (Windows/macOS/Linux) wrapping the React frontend; backend ships as a [[Sidecar Binary]].

## Used for

- Desktop application packaging (MSI, DMG, AppImage, deb)
- Bundling the Python backend as a sidecar that auto-starts on launch
- Native integrations: filesystem, dialog, autostart, shell

## Configuration

- `frontend/src-tauri/tauri.conf.json` — app identifier, bundle config
- `frontend/src-tauri/capabilities/default.json` — shell command permissions live here, NOT in `tauri.conf.json`
- Build: `bun run tauri:build`, dev: `bun run tauri:dev`
- Windows requires Rust + VS2022 Build Tools (MSVC v143 + Windows SDK)

## Gotchas

- Do not use `plugins.shell.scope` in `tauri.conf.json` (v2 removed it)
- Keep `plugins.shell` minimal — put permissions in capabilities files
- Backend port differs between dev (7001) and sidecar (7000)

## See also

- [[_index]]
- [[Sidecar Binary]]
- [[Tauri Build Commands]]
