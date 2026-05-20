---
tags: [pattern]
---

# In-Place Message Updates

> For rows that transition state (running → saved), mutate the existing message doc and emit `message_updated` — don't insert a second row.

## When to apply

Any chat-session row that has a lifecycle: pending → running → completed, or running → saved.

## The pattern

```python
# 1. Capture id on initial insert
doc = await persist_session_message_doc(session_id, ...)
message_id = doc.id

# 2. Later, mutate in place
existing = await AgentSessionMessage.get(message_id)
existing.status = "saved"
await existing.save()

# 3. Broadcast the update
await _broadcast_message_updated(session_id, existing)
```

Frontend dedups by 24-char hex DB id — DB wins.

## Why

Inserting a second row creates duplicate UI entries. The `message_updated` WebSocket event lets the frontend patch the existing row in place.

## Don't

- Don't insert a new row to represent a state change — mutate the existing one
- Don't omit `id` from REST `MessageResponse` or frontend `SessionMessage` — dedup breaks without it

## See also

- [[_index]]
- [[persist_session_message Pattern]]
- [[Chat-Session Checklist]]
