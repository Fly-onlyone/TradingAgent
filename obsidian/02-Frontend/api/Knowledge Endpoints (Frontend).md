---
tags: [frontend, api, knowledge]
---

# Knowledge Endpoints (Frontend)

> `knowledgeApi` — semantic search and CRUD across the RAG corpora: strategies, lessons, patterns; plus an agent-context helper.

## Source

- `frontend/src/api/endpoints/knowledge.ts`

## How it works

`search(KnowledgeQuery)` posts `/knowledge/search` — hits the hybrid retrieval pipeline (vector + text + RRF + optional rerank, see backend architecture). `getStrategies`, `getLessons`, `getPatterns` are list endpoints accepting optional filter params (symbol, outcome, type, minSuccessRate, limit). `createStrategy` posts new `StrategyKnowledge` (used by manual entry UIs). `getContext(query)` returns a pre-formatted context string used by the agent. Unlike other endpoints, the response types are already-camelCase shared `@/types` interfaces — no transform layer needed because the backend Pydantic models alias to camelCase here.

## Depends on

- [[HTTP Client Interceptor]]

## See also

- [[_index]]
- [[Knowledge Endpoints]] (backend)
