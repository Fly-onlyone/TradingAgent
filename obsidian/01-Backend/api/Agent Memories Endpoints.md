---
tags: [backend, api, agent, memory]
---

# Agent Memories Endpoints

> CRUD + search for cross-session [[AgentMemory Model]] documents under `/agent/memories`.

## Source

- `backend/app/api/v1/agent_memories.py`

## How it works

Memories are short user-scoped notes the agent can recall across sessions — categories like `user_preference`, `trading_rule`, `lesson_learned`. Each category has a TTL from `CATEGORY_TTL` so volatile observations expire automatically. The agent loads recent memories via `load_session_memories()` ([[Agent WS Channel]] startup) and inserts new ones via its memory tool. `POST /search` runs an embedding lookup over the user's memories. `access_count` + `last_accessed_at` are bumped on retrieval to bias future ranking.

## Endpoints

- `GET /agent/memories` — paginated list, filterable by category/tags
- `GET /agent/memories/stats` — per-category counts
- `GET /agent/memories/categories` — category metadata + TTLs
- `POST /agent/memories` — create
- `POST /agent/memories/search` — embedding search
- `GET/PUT/DELETE /agent/memories/{id}`

## Depends on

- [[AgentMemory Model]]
- [[RAG Retrieval Pipeline]]

## See also

- [[_index]]
- [[Chat-Session Lifecycle]]
