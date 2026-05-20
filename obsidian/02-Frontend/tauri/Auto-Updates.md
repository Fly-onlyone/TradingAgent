---
tags: [frontend, tauri]
---

# Auto-Updates

> Tauri updater plugin — not currently enabled. Releases ship via GitHub Release artifacts produced by `tauri-build.yml`.

## Source

- `frontend/src-tauri/tauri.conf.json` (no `updater` block currently)
- `.github/workflows/tauri-build.yml`

## How it works

Today, when Release Please merges the `chore(release): vX.Y.Z` PR and the tag
pushes, `tauri-build.yml` builds MSI/DMG/AppImage/deb artifacts and attaches
them to the GitHub Release; users manually download/install. To enable
in-app auto-updates you'd add `plugins.updater` to `tauri.conf.json`,
sign builds with the updater keypair, publish a `latest.json` manifest, and
add `tauri-plugin-updater` + a frontend prompt — none of which is wired today.

## See also

- [[_index]]
- [[Tauri v2 Config]]
