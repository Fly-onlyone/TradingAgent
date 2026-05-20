---
tags: [glossary]
---

# Sidecar

A Tauri term for a bundled executable shipped alongside the desktop app and managed by its lifecycle. In this project the [[Sidecar Binary]] is the Python backend, built via PyInstaller and started automatically by [[Tauri v2]]. The sidecar listens on port **7000** (vs **7001** for the dev server). See [[Backend Port 7000 vs 7001]].

## See also

- [[_index]]
- [[Sidecar Binary]]
- [[Tauri v2]]
