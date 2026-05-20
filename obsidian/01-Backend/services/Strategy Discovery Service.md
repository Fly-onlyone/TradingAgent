---
tags: [backend, services, strategy-discovery]
---

# Strategy Discovery Service

> Orchestrates one end-to-end auto-discovery cycle — Explorer scout → parallel Extractor fan-out → dedup → persist `StrategyKnowledge`.

## Source

- `backend/app/services/strategy_discovery.py`

## How it works

`StrategyDiscoveryService.run_discovery_cycle()` opens a [[StrategyDiscoveryCycle Model]], gates on `emergency_stop_active`, then runs the `StrategyExplorerAgent` to pick Brave queries and emit `ArticleCandidate`s. Bodies are loaded via [[Article Fetcher]] and fanned out to one `StrategyExtractorAgent` subagent per article, bounded by `asyncio.Semaphore(auto_discover_max_parallel_extractions)`. Results are merged via [[Strategy Dedup]], filtered against `auto_discover_min_confidence`, and saved as [[StrategyKnowledge Model]] + embedding + initial rating from [[Strategy Rating Calculator]]. A `Strategy` shadow doc is created when a `user_id` is available — required for the Strategies page. Cycle lifecycle messages are recorded on the Explorer's `AgentSession` ([[Chat-Session Checklist]] leg) and a `TASK_COMPLETED` / `TASK_FAILED` toast fires via [[Notification Service]].

## Depends on

- [[StrategyExtractor]]
- [[Article Fetcher]]
- [[Strategy Dedup]]
- [[Strategy Rating Calculator]]
- [[Notification Service]]
- [[StrategyKnowledge Model]]
- [[StrategyDiscoveryCycle Model]]

## Used by

- [[Strategy Discovery Admin Endpoints]]
- [[Task Scheduler]]

## Gotchas

- `check_discovery_blocked()` re-runs inside the cycle (belt-and-suspenders) so manual `/run-now` triggers cannot bypass the emergency-stop latch.
- Every `except` path finalizes the cycle row to `FAILED` so the UI never shows ghost active cycles.
- The Strategy shadow doc is silently skipped when no superuser exists — log warning is emitted.

## See also

- [[_index]]
- [[Strategy Auto-Discovery Cycle]]
