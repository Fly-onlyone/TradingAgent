---
tags: [backend, api, agent, chat]
---

# Agent Sessions Endpoints

> Persistence of [[AgentSession Model]] + [[AgentSessionMessage Model]] for chat history under `/agent/sessions`.

## Source

- `backend/app/api/v1/agent_sessions.py`

## How it works

Sessions own the chat metadata (title, description, kind, statistics, `pending_question` state). Messages are written through `persist_session_message()` helpers — every insert returns the DB id which `MessageResponse.id` carries on the wire so the frontend can dedupe on hydrate and the backend can update messages in place ([[Chat-Session Checklist]] "Message id on wire" leg). `/grouped` returns chats bucketed by relative date (Today/Yesterday/This Week/etc.) for the sidebar. `/{id}/messages` is paginated via a `before` cursor for infinite-scroll history.

## Endpoints

- `POST/GET /agent/sessions` — create / list
- `GET /agent/sessions/grouped` — sidebar grouping
- `GET /agent/sessions/{id}` / `PUT /agent/sessions/{id}`
- `GET /agent/sessions/{id}/messages` — paginated history
- `POST /agent/sessions/{id}/messages` — append (used by REST callers)
- `POST /agent/sessions/{id}/end` / `DELETE /agent/sessions/{id}`

## Depends on

- [[AgentSession Model]]
- [[AgentSessionMessage Model]]

## Used by

- Frontend chat sidebar + history pane
- [[Agent WS Channel]] (loads + appends)

## See also

- [[_index]]
- [[Chat-Session Lifecycle]]
