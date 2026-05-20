---
tags: [frontend, tauri]
---

# Tauri Env Detection

> Runtime check + base-URL helpers so the same React code works in browser dev, browser-installed PWA, and packaged Tauri desktop.

## Source

- `frontend/src/utils/tauriEnv.ts`
- `frontend/src/utils/tauriEnv.test.ts`

## How it works

`isTauri()` returns `true` when `__TAURI_INTERNALS__` is on `window` — Tauri v2
injects this into every webview. `getBackendBaseUrl()` resolves to
`http://localhost:${VITE_BACKEND_PORT}` (default **7001** dev, **7000**
production-Tauri). `getApiBaseUrl()` returns `${backend}/api/v1` under Tauri
and the relative `/api/v1` under Vite (which proxies via dev server / PWA).
`getWsUrl(path)` mirrors the same: absolute `ws://localhost:7000/...` in
Tauri, derived from `window.location` in browser mode.

## Depends on

- `VITE_BACKEND_PORT` (build-time env)

## Used by

- [[HTTP Client Interceptor]]
- [[useWebSocket Hook]]
- [[useAgentSocket]]

## Gotchas

- Production-Tauri port matches the [[Sidecar Binary]] (7000). Mismatched env vars between Rust and Vite will silently break API calls.

## See also

- [[_index]]
- [[Sidecar Binary]]
