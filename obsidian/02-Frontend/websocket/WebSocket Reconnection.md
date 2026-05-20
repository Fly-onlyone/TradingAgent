---
tags: [frontend, websocket]
---

# WebSocket Reconnection

> On unexpected `close`, [[useWebSocket Hook]] retries every `reconnectInterval` ms up to `maxReconnectAttempts` — UNLESS the close code is `>= 4000` (application-level), which means reconnecting won't help.

## Source

- `frontend/src/api/websocket/useWebSocket.ts`

## How it works

`onclose` checks `event.code >= 4000` (`isAppClose`). For app-level closes (e.g. auth required, capacity, invalid session) the hook bails out — the backend has signaled "don't retry". Otherwise, attempts increment up to `maxReconnectAttempts` (default 5; [[useAgentSocket]] overrides to 20 because the Tauri sidecar can take ~30s to boot). The retry uses a fixed `reconnectInterval` (default 3000ms — no exponential backoff). On give-up, a console warning fires. Manual `reconnect()` zeros the counter and bumps a reconnect key to retrigger the effect.

## See also

- [[_index]]
- [[useWebSocket Hook]]
