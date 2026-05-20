---
tags: [frontend, websocket, hooks]
---

# useWebSocket Hook

> Generic React WebSocket hook: connect, auto-reconnect, heartbeat, callbacks. Returns `{ isConnected, send, disconnect, reconnect }`.

## Source

- `frontend/src/api/websocket/useWebSocket.ts`

## How it works

`onOpen/onClose/onError/onMessage` callbacks are stashed in refs so prop changes never tear down the socket. The `useEffect` only re-runs on `url`/`enabled`/`reconnectInterval`/etc. — not on callback identity. On open, optionally starts a `setInterval` that sends `heartbeatMessage` every `heartbeatIntervalMs` (default 20s). Messages are `JSON.parse`'d before passing to `onMessage`; parse failures are logged + sent to Sentry. `cleanupWs` nulls handlers before `close()` so straggler events don't fire after unmount. Manual `reconnect()` resets attempts and bumps an internal key to retrigger the effect.

## Used by

- [[useAgentSocket]]
- Market/Orders socket hooks (same pattern)

## See also

- [[_index]]
- [[WebSocket Reconnection]]
