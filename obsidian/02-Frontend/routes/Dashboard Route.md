---
tags: [frontend, routes]
---

# Dashboard Route

> `/` — at-a-glance home: agent status, recent decisions, recent trades.

## Source

- `frontend/src/routes/index.tsx`

## How it works

`requireAuth()` guard. Composes three dashboard sections from
`components/dashboard/`: `DashboardAgentStatusCard` (current cycle state),
`DashboardAgentDecisionsSection` (last decisions via [[DecisionCard]]), and
`DashboardRecentTradesSection` (trade ledger summary). Each section is its
own data-isolated React Query island, so a slow endpoint can't block the others.

## Depends on

- [[React Query Options]]
- [[agentStore]]
- [[tradeStore]]

## See also

- [[_index]]
- [[Agent Route]]
