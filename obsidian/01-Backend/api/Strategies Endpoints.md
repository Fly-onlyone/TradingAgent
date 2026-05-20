---
tags: [backend, api, strategies]
---

# Strategies Endpoints

> CRUD + activate/deactivate for the executable [[Strategy Model]] under `/strategies`.

## Source

- `backend/app/api/v1/strategies.py`

## How it works

Vanilla Beanie CRUD scoped by `user_id`. Strategies are user-owned `Document`s linked to a [[StrategyKnowledge Model]] via `knowledge_id` (set when the strategy is created by [[Strategy Discovery Service]] or [[Strategy Import Endpoints]]). `/{id}/activate` and `/{id}/deactivate` flip `is_active`. `/{id}/knowledge` resolves the linked `StrategyKnowledge` for the RAG-only details.

## Endpoints

- `POST /strategies` — create
- `GET /strategies` — paginated list (filter by `is_active`)
- `GET /strategies/{id}` / `PATCH /strategies/{id}` / `DELETE /strategies/{id}`
- `POST /strategies/{id}/activate` / `…/deactivate`
- `GET /strategies/{id}/knowledge` — linked StrategyKnowledge

## Depends on

- [[Strategy Model]]
- [[StrategyKnowledge Model]]

## Gotchas

- `/strategies/import/*` and `/strategies/ratings/*` are NOT here — see [[Strategy Import Endpoints]] / [[Strategy Ratings Endpoints]]. Registration order matters (see [[Router Registration Order]]).

## See also

- [[_index]]
