---
tags: [frontend, utils, performance]
---

# Performance Metrics

> Page-load Web Vitals (LCP/FCP/TTFB/DOM) and route-transition timings, both forwarded to the backend.

## Source

- `frontend/src/utils/performance/pageLoadMetrics.ts`
- `frontend/src/utils/performance/navigationMetrics.ts`

## How it works

**`pageLoadMetrics`** subscribes to `onLCP` / `onFCP` / `onTTFB` from `web-vitals` and reads `domContentLoadedEventEnd - startTime` from the navigation timing entry. Once all four collect (or after a 10s safety timeout), it dispatches a single `[pageload]` log via [[Frontend Logger]] — but only when the slowest metric ≥ 3000ms, to avoid noise on fast loads.

**`navigationMetrics`** brackets each TanStack Router transition in a manual Sentry span (`ui.navigation`). `markNavStart(routeId)` opens the span; `markNavEnd(routeId)` finishes it and returns the duration. `reportNavDuration(routeId, ms)` logs `[navigation]` when ≥ 800ms.

Both initialize via `bootstrapObservability()` in [[Sentry Frontend]] using `requestIdleCallback` so they don't compete with first paint.

## Depends on

- [[Frontend Logger]]
- [[Sentry Frontend]]
