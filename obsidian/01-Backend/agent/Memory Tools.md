---
tags: [backend, agent, tools]
---

# Memory Tools

> Cross-session agent memory — save / search / update / delete user-scoped notes with embedding-based dedup and per-category retention.

## Source

- `backend/app/agent/tools/memory_tools.py`

## How it works

`save_memory()` validates the `MemoryCategory`, enforces `MAX_MEMORIES_PER_USER` and `MAX_CONTENT_LENGTH`, generates a document embedding via [[Local Embeddings]], and checks for a near-duplicate (cosine ≥ `_DEDUP_THRESHOLD = 0.95`) in the same category — if found it updates in place rather than inserting. Auto-expiry is set per-category (`_compute_expires_at`).

`search_memories()` does vector similarity against `AgentMemory` rows for the user, optionally filtered by category/tag.

`update_memory()` / `delete_memory()` operate by `_id` after asserting ownership.

A `get_session_start_memories()` helper (used by the agent WebSocket) injects up to 25 most-relevant items at conversation start, capped per-category (`_INJECTION_LIMITS`) — preferences, watchlist, trading context, decision rationale, lessons.

## Depends on

- `AgentMemory` model + `MemoryCategory` enum
- [[Local Embeddings]] — `EmbeddingService`

## Used by

- [[MCP Tools]] (`mcp_save_memory`, `mcp_search_memories`, `mcp_update_memory`, `mcp_delete_memory`)
- Agent WebSocket session-start hook

## Gotchas

- `market_observation` is intentionally excluded from injection — too transient.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
