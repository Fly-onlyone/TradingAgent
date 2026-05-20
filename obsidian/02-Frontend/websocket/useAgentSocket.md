---
tags: [frontend, websocket, agent]
---

# useAgentSocket

> Agent chat hook split in two: `useAgentSocketConnection` owns the live socket; `useAgentSocket` exposes the per-component API (`sendMessage`, `executeDecision`, etc.) without re-opening it.

## Source

- `frontend/src/api/websocket/useAgentSocket.ts`

## How it works

The connection hook subscribes once at the app root with the auth token in the URL, wires `onMessage → handleMessage` (the big switch over `message`, `thinking`, `text_delta`, `tool_call`, `ask_user`, `decision`, `chart_data`, `usage`, `session_created`, `cancel_ack`, `error`, `data_event`). Routing is by `(activeRunSessionId ?? selectedSessionId)`. Final assistant messages clear `activeRunSessionId` UNLESS the WS payload had `keep_running: true` (multi-message subagent runs). `data_event` invalidates TanStack caches by category. Both hooks share a module-level `sharedSocketControls` object so consumers `send()` without holding the WebSocket itself.

## Used by

- Agent route, chat input, decisions

## See also

- [[_index]]
- [[useWebSocket Hook]]
- [[agentStore]]
- [[Agent WS Channel]]
- [[Chat-Session Checklist]]
- [[WebSocket Message Dedup]]
