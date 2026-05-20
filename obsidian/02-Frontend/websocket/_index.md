---
tags: [frontend, websocket, moc]
---

# WebSocket MOC

> Real-time hooks under `frontend/src/api/websocket/`.

## Hooks

- [[useWebSocket Hook]] — generic connection + heartbeat + reconnect
- [[useAgentSocket]] — agent chat hook wrapping the generic one

## Mechanics

- [[WebSocket Reconnection]] — backoff + 4xxx close codes
- [[WebSocket Message Dedup]] — DB id wins, semantic key for legacy

## Related

- [[Agent WS Channel]] (backend)
- [[Market WS Channel]] (backend)
- [[Orders WS Channel]] (backend)
- [[WS Connection Manager]] (backend)

## See also

- [[agentStore]]
- [[Chat-Session Checklist]]
