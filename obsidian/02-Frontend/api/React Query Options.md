---
tags: [frontend, api, queries]
---

# React Query Options

> Centralized `queryOptions()` factories under `frontend/src/api/queryOptions/`. Admin queries share `ADMIN_STALE_TIME` (60s) and `ADMIN_GC_TIME` (10min).

## Source

- `frontend/src/api/queryOptions/admin.ts`
- `frontend/src/api/queryOptions/_factory.ts`
- Per-domain: `agent.ts`, `dashboard.ts`, `market.ts`, `memory.ts`

## How it works

`createQueryOptionsFactory({ staleTime, gcTime, refetchOnMount })` returns a curried helper that wraps `queryKey + queryFn` with defaults. Admin uses `staleTime: 60_000`, `gcTime: 10 * 60_000`, `refetchOnMount: false` — heavy collection listings don't refetch on every tab switch. Pages then `useQuery({ ...adminCollectionsQueryOptions() })`. The factory pattern means changing defaults updates every admin query in one place.

## Used by

- All TanStack `useQuery` / `useSuspenseQuery` call sites
- WebSocket invalidations in [[useAgentSocket]] (`queryClient.invalidateQueries({ queryKey: [...] })`)

## See also

- [[_index]]
- [[TanStack Query]]
