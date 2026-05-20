---
tags: [frontend, tauri, backend]
---

# Sidecar Binary

> The Python backend ships as `trading-agent-backend.exe` and is spawned as a Tauri shell child — port **7000** in production, **7001** in dev.

## Source

- `frontend/src-tauri/src/lib.rs` (`backend_command`, `spawn_backend_once`)
- `frontend/src-tauri/tauri.conf.json` (`bundle.resources`)

## How it works

In packaged builds, Rust resolves the bundled exe via `BaseDirectory::Resource`
and runs `--preflight` first to validate config, then spawns it with
`BACKEND_PORT=7000` and `APP_ENV_FILE=<config_dir>/.env`. In dev, Rust prefers
`./.venv/Scripts/python.exe run.py --watch` falling back to `uv run python run.py
--watch`, with `BACKEND_PORT=7001`. The child is bound to a Windows Job Object
(`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) so it dies with Tauri. Shutdown escalates
HTTP → tracked child kill → `taskkill /F /T`. Health checks poll `/health` for
30s.

## Depends on

- [[Capabilities]] (`shell:allow-spawn`)
- `tauri-plugin-shell`

## Used by

- Everything — frontend HTTP/WS goes to this process

## Gotchas

- Port collision raises `backend_port_in_use` startup failure event.

## See also

- [[_index]]
- [[Tauri Env Detection]]
