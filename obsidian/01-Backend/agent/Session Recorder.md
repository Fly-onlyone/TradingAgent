---
tags: [backend, agent, chat-session]
---

# Session Recorder

> Bridge between Claude SDK streams and the `AgentSession` / `AgentSessionMessage` collections — every persistence path also broadcasts a live WebSocket event so the chat UI streams in real time.

## Source

- `backend/app/agent/session_recorder.py`

## How it works

`create_subagent_session(user_id, title, description)` inserts a fresh `AgentSession` with `session_kind=SUBAGENT`. The `AgentSessionRecorder` class wraps that session and offers:

- `record_user_message` / `record_system_note` — append a turn + WS broadcast + thinking pill.
- `stream_turn(client)` — drain `client.receive_response()`, collect text/thinking/tool-use blocks, then flush ONE assistant message via `persist_session_message`.
- `record_delegation` / `update_delegation_status` — render a `delegate_to_extractor` tool-call card in the parent's chat and mutate it in place when the child finishes (uses `persist_session_message_doc` to capture the inserted doc id, then `AgentSessionMessage.get(id).save()` + `broadcast_message_updated` — see [[Chat-Session Checklist]] "In-place updates").
- `record_summary`, `end` — finalize the session.

Module-level `broadcast_assistant_message` / `broadcast_message_updated` / `broadcast_thinking` send to `agent_channel_user_id` so the WS connection manager fans out to the right user.

## Depends on

- [[AgentSession Model]], [[AgentSessionMessage Model]]
- `persist_session_message`, `persist_session_message_doc` — see [[persist_session_message Pattern]]
- WebSocket connection manager + `agent_channel_user_id` helper

## Used by

- [[StrategyExplorer]]
- [[Task Scheduler]] — task-run sessions
- Any future chat-session surface

## Gotchas

- `keep_running=True` keeps the sidebar spinner on; the FINAL message must omit it so the frontend auto-clears `activeRunSessionId`.

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[Chat-Session Lifecycle]]
