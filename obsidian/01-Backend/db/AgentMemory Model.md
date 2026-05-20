---
tags: [backend, db, model]
---

# AgentMemory Model

> Cross-session memory entry for the agent — categorized, TTL-bound, embedded for semantic recall, capped at 200 per user.

## Source

- `backend/app/db/models/agent_memory.py`
- Collection: `agent_memories`

## Key fields

- `user_id`, `category: MemoryCategory`, `content` (max 2000 chars)
- `tags`, `source` (`conversation` / `task`), `session_id`
- `expires_at` (TTL-indexed), `embedding`
- Usage: `access_count`, `last_accessed_at`

## TTL by category

- `PREFERENCE` → permanent
- `WATCHLIST` → 30 days
- `TRADING_CONTEXT` → 7 days
- `MARKET_OBSERVATION` → 24 hours
- `DECISION_RATIONALE` → 14 days
- `LESSON` → 90 days
- `GENERAL` → 30 days

## Used by

- Agent `save_memory` / `recall_memory` tools
- [[TradingAgent]] across sessions

## Special features

- MongoDB TTL index `expireAfterSeconds=0` on `expires_at`
- `MAX_MEMORIES_PER_USER = 200` enforced by tool layer

## See also

- [[_index]]
- [[AgentSession Model]]
