---
tags: [backend, db, model, chat]
---

# AgentSessionMessage Model

> One persisted chat message — written via `persist_session_message()` so every leg of the [[Chat-Session Checklist]] (WS broadcast, sidebar spinner, in-place updates) stays consistent.

## Source

- `backend/app/db/models/agent_session.py` — `AgentSessionMessage`
- Collection: `agent_session_messages`

## Key fields

- `session_id` (indexed), `user_id` (indexed)
- `role: MessageRole` (`user` / `assistant` / `system`)
- `content`, `timestamp` (indexed), `decision_id`
- `tool_calls: list[dict]`, `thinking_content`, `tokens_used`

## Used by

- `persist_session_message()` / `persist_session_message_doc()` writers
- WebSocket agent channel broadcasts (`type: "message"`)
- [[persist_session_message Pattern]] for in-place delegation updates

## Special features

- Compound indexes `(session_id, timestamp ASC)` and `(user_id, session_id, timestamp DESC)`
- `to_session_message()` / `from_session_message()` map to/from the embedded `SessionMessage` shape exposed via REST
- `id` is required on the wire so frontend can dedupe and the parent agent can mutate the row later

## See also

- [[_index]]
- [[AgentSession Model]]
- [[persist_session_message Pattern]]
- [[Chat-Session Checklist]]
