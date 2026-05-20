---
tags: [frontend, routes]
---

# Strategies Routes

> `/strategies` — strategy catalog. `/strategies/create` — two-step import flow.

## Source

- `frontend/src/routes/strategies/index.tsx`
- `frontend/src/routes/strategies/create.tsx`

## How it works

Both routes are `requireAuth()`-guarded. The catalog lists `Strategy` docs
(executable) and surfaces a `StrategyDiscoveryCard` showing the most recent
auto-discovery cycle. The create page implements the extract-then-confirm
flow against `/api/v1/strategies/import/` — Claude extracts structured fields
from raw text, the user reviews, then both `Strategy` and `StrategyKnowledge`
(with embedding) are saved.

## Depends on

- [[discoveryStore]]
- [[React Query Options]]

## See also

- [[_index]]
- [[Knowledge Route]]
