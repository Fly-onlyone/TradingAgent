---
tags: [backend, api, websocket, infra]
---

# WS Connection Manager

> Singleton `manager: ConnectionManager` that tracks every live WebSocket and fans messages out to channels or users.

## Source

- `backend/app/api/websocket/connection_manager.py`

## How it works

Maintains two indexes guarded by an `asyncio.Lock`:

- `active_connections[channel]` — list of sockets per channel name (e.g. `agent:chat:42`).
- `user_connections[user_id]` — list of sockets per int user-id, used by `send_to_user()` for per-user fanout.

Public API: `connect(ws, channel, user_id?)`, `disconnect(...)`, `broadcast_to_channel(channel, message)`, `send_to_user(user_id, message)`, `send_personal(ws, message)`. Dead sockets are pruned in-line after each broadcast pass. `send_personal` is safe — it swallows + logs `send_json` failures so an upstream handler doesn't crash on a half-closed client.

The module-level `manager` instance is imported by every WS endpoint and by every background service that emits live updates (task scheduler, agent subagents, market adapter).

## Depends on

- `fastapi.WebSocket`

## Used by

- [[Agent WS Channel]]
- [[Market WS Channel]]
- [[Orders WS Channel]]
- Background services that broadcast chat/run progress (Strategy Discovery, scheduler, etc.)

## See also

- [[_index]]
- [[Chat-Session Checklist]]
