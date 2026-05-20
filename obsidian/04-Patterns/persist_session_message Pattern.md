---
tags: [pattern]
---

# persist_session_message Pattern

> Required helper for every `AgentSessionMessage` insert — handles persistence + WebSocket broadcast in one call.

## When to apply

Any code path that adds a message to an `AgentSession`.

## The pattern

```python
from app.db.models.agent_session import persist_session_message, persist_session_message_doc

# Simple insert + broadcast
await persist_session_message(session_id, role, content, ...)

# When you need the inserted document id (for later in-place updates)
doc = await persist_session_message_doc(session_id, role, content, ...)
message_id = doc.id
```

Followed by a `manager.send_to_user(...)` broadcast carrying the outer `session_id` (see `backend/app/api/websocket/agent.py`).

## Why

Direct `await AgentSessionMessage(...).insert()` skips the WebSocket broadcast — the UI never updates and the user thinks the agent stalled.

## Don't

- Don't insert `AgentSessionMessage` documents directly
- Don't forget to capture the doc id when the message will transition state later

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[In-Place Message Updates]]
