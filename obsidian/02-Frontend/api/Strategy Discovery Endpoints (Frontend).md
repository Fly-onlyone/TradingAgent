---
tags: [frontend, api, discovery]
---

# Strategy Discovery Endpoints (Frontend)

> `strategyDiscoveryApi` — kick off / inspect Explorer + Extractor subagent cycles.

## Source

- `frontend/src/api/endpoints/strategyDiscovery.ts`

## How it works

`runCycle()` POSTs `/admin/strategy-discovery/run` and returns one `CycleRunResult` (cycle id, explorer session id, save counts, error). `listCycles({ page, pageSize })` returns a paginated `DiscoveryCycleSummary[]` via `transformCycle` (running | ok | failed, `manual`, `triggered_by_user_id`, session ids, all counters). The streaming SSE counterpart lives in [[discoveryStore]] (different URL: `/settings/strategy-discovery/run-now`).

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- `strategyDiscoveryCyclesQueryOptions` in [[React Query Options]]
- `StrategyDiscoveryCard` and admin route

## See also

- [[_index]]
- [[Strategy Discovery Admin Endpoints]] (backend)
- [[discoveryStore]]
- [[Chat-Session Lifecycle]]
