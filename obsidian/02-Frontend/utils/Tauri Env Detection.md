---
tags: [frontend, utils, tauri]
---

# Tauri Env Detection

> Tells the rest of the app whether it's running inside the Tauri WebView and resolves the correct API / WS origin.

## Source

- `frontend/src/utils/tauriEnv.ts`

## How it works

```ts
isTauri()                  // checks "__TAURI_INTERNALS__" in window
getBackendBaseUrl()        // http://localhost:<TAURI_BACKEND_PORT>
getApiBaseUrl()            // Tauri: ${backend}/api/v1 — browser: /api/v1
getWsUrl(path)             // Tauri: ws://localhost:<port>${path} — browser: derived from window.location protocol
```

`TAURI_BACKEND_PORT` is `VITE_BACKEND_PORT` if set, else `7001` (dev) / `7000` (prod). In browser dev the Vite proxy forwards `/api/v1` to the backend; in Tauri the frontend talks to the sidecar directly via `localhost`.

## Used by

- `api/client.ts`, WebSocket hooks, [[Sentry Frontend]], [[Frontend Logger]], [[Autostart]], [[Window Startup]]

## See also

- [[Tauri v2]]
- [[Sidecar Binary]]
