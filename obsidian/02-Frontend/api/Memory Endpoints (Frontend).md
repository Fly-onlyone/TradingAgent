---
tags: [frontend, api, memory]
---

# Memory Endpoints (Frontend)

> `memoryApi` — agent long-term memory CRUD + semantic search + per-category TTL metadata.

## Source

- `frontend/src/api/endpoints/memory.ts`

## How it works

All responses go through `transformMemory` → camelCase `AgentMemory` (`session_id → sessionId`, `expires_at → expiresAt`, `access_count → accessCount`, `last_accessed_at → lastAccessedAt`). `getMemories(filter)` is paginated with `category` / `tag` filters. `getMemoryStats()` returns counts by category, permanent vs expiring soon. `getCategories()` lists `{ value, label, ttlDescription }` for the editor's category dropdown. `createMemory` / `updateMemory` accept camelCase; `searchMemories(query, category?, limit=10)` POSTs the query.

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- Agent memory drawer / settings; also invalidated by `data_event: memories` in [[useAgentSocket]]

## See also

- [[_index]]
- [[agentStore]]
