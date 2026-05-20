---
tags: [backend, api, websocket, agent]
---

# Agent WS Channel

> Interactive chat WebSocket at `/ws/agent/chat` plus passive `…/status` and `…/decisions` broadcast channels.

## Source

- `backend/app/api/websocket/agent.py`

## How it works

`/ws/agent/chat` authenticates via JWT query param (or `_DEV_USER_ID` in debug bypass), resolves a deterministic int user-id via `agent_channel_user_id(user.id)` (`_get_user_id_int`), and registers on the `agent:chat:{user_id_int}` channel through the [[WS Connection Manager]]. The agent is created lazily on the first user message via `create_agent_with_tools()`. Each turn runs `agent.chat(message, on_event=send_event)` with a 1200s timeout, streams `thinking` / `tool_call` events through `send_personal`, then persists the assistant reply via `persist_session_message_doc()` and broadcasts a `message` event whose `data.id` is the real `AgentSessionMessage` id ([[Chat-Session Checklist]] "Message id on wire" leg). Cancel requests interrupt the SDK process; partial responses are saved when present. An `ANALYSIS_READY` notification fires via [[Notification Service]] after each successful turn.

`/ws/agent/status` and `/ws/agent/decisions` are passive subscribe-only channels for the agent activity panels — the task scheduler and order executor push to them.

## Endpoints

- `WS /ws/agent/chat?token=…`
- `WS /ws/agent/status?token=…`
- `WS /ws/agent/decisions?token=…`

## Depends on

- [[WS Connection Manager]]
- [[Auth Endpoints]] (token validation, `is_token_revoked_by_password_change`)
- [[AgentSession Model]] / [[AgentSessionMessage Model]]
- [[Notification Service]]

## Gotchas

- `_get_user_id_int` MUST be used everywhere broadcasting to the chat channel — bare `int(user.id)` won't match. The same helper feeds the `_agent_channel_user_id` used by background services (Explorer/Extractor session-message broadcasts).
- Windows `STATUS_CONTROL_C_EXIT` (`3221225786`) is treated specially in `_format_agent_error` — antivirus often triggers it.

## See also

- [[_index]]
- [[Chat-Session Lifecycle]]
- [[Chat-Session Checklist]]
