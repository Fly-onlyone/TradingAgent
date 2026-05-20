---
tags: [backend, db, model, chat]
---

# AgentSession Model

> Chat / task-run session header — owns title, counters, symbols discussed, and the active pending question; messages live in [[AgentSessionMessage Model]].

## Source

- `backend/app/db/models/agent_session.py` — `AgentSession`
- Collection: `agent_sessions`

## Key fields

- `user_id`, `sdk_session_id`, `session_kind` (`chat`/`task_run`/`subagent`)
- `title`, `description`
- `messages: list[SessionMessage]` — legacy embedded; new writes go to `AgentSessionMessage`
- `active_pending_question: PendingQuestionState`
- Stats: `total_messages`, `user_messages`, `assistant_messages`, `decisions_made`, `trades_executed`, `total_tokens`
- `symbols_discussed: list[str]`
- `is_active`, `started_at`, `ended_at`, `last_message_at` (indexed)

## Used by

- [[Chat-Session Lifecycle]]
- [[persist_session_message Pattern]]
- [[Subagent Delegation Pattern]] (parent session captures delegation bubbles)
- [[Strategy Auto-Discovery Cycle]]

## Special features

- `add_message()` and `record_message()` increment per-role counters
- `fetch_session_message_window()` paginates newest-first with an older-history cursor
- `_normalize_delegation_messages()` collapses running→terminal `delegate_to_extractor` cards
- Honour the [[Chat-Session Checklist]] when adding new session-writing features

## See also

- [[_index]]
- [[AgentSessionMessage Model]]
- [[Chat-Session Checklist]]
