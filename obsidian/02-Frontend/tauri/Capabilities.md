---
tags: [frontend, tauri]
---

# Capabilities

> `src-tauri/capabilities/default.json` — Tauri v2's permission system. ALL shell / fs / dialog / autostart command permissions live here, NOT in `tauri.conf.json`.

## Source

- `frontend/src-tauri/capabilities/default.json`

## How it works

A capability binds a list of `permissions` to one or more `windows` (here:
`["main"]`). Current grants: `core:default`, `autostart:allow-{enable,disable,is-enabled}`,
`shell:allow-{open,spawn,kill}` (needed for the [[Sidecar Binary]]),
`dialog:default`, `fs:default` + `fs:allow-{write,read}-file`, plus an
`fs:scope` entry that allows `**` (broad — required because the backend writes
to `app_config_dir`). Adding a new plugin command (e.g. notifications, updater)
means adding its permission identifier here.

## Depends on

- [[Tauri v2 Config]]

## Used by

- [[Sidecar Binary]] (shell:allow-spawn)
- [[IPC Commands]] (core:default)

## Gotchas

- Tauri v2 does **not** support `plugins.shell.scope` in `tauri.conf.json` — putting it there is silently ignored.
- The `fs:scope` `**` allow-all is broad; tighten if/when packaging for distribution.

## See also

- [[_index]]
