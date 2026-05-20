---
tags: [frontend, api, strategies]
---

# Strategies Endpoints (Frontend)

> `strategiesApi` — CRUD, toggle, backtest, signals, two-step URL/file import, and strategy-knowledge fetch.

## Source

- `frontend/src/api/endpoints/strategies.ts`

## How it works

Standard CRUD via `/strategies` with `transformStrategy` mapping each response (also handles single + plural endpoints). `updateStrategy` builds a sparse PATCH payload — only fields present in the `StrategyUpdate` are forwarded as snake_case. `runBacktest` POSTs `/strategies/:id/backtest`. `extractFromUrl` and `extractFromFile` (multipart) hit the two-step import flow — they DO NOT save; the UI then calls `confirmImport(StrategyImportConfirm)` to persist both `Strategy` + `StrategyKnowledge`. `getStrategyKnowledge` reads the extraction trace + source URL for display.

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- Strategies page, import wizard

## See also

- [[_index]]
- [[Strategies Endpoints]] (backend)
