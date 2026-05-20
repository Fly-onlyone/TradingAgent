---
tags: [backend, api, admin, strategy-discovery]
---

# Strategy Discovery Admin Endpoints

> Manual trigger + cycle history for the agentic auto-discovery pipeline under `/admin/strategy-discovery`.

## Source

- `backend/app/api/v1/admin_strategy_discovery.py`

## How it works

`POST /run` blocks until the cycle finishes (10-minute wall-clock ceiling) and returns the same stats payload as the scheduled path. Re-runs the emergency-stop gate (`check_discovery_blocked()`) before delegating to [[Strategy Discovery Service]]`.run_discovery_cycle(manual=True)`. `/cycles` and `/cycles/{id}` read [[StrategyDiscoveryCycle Model]] for the admin UI's run-history table, surfacing the `explorer_session_id` so the user can deep-link into the live chat.

## Endpoints

- `POST /admin/strategy-discovery/run` — manual cycle (timeout 600s)
- `GET /admin/strategy-discovery/cycles` — paginated history
- `GET /admin/strategy-discovery/cycles/{id}` — single cycle details

## Depends on

- [[Strategy Discovery Service]]
- [[StrategyDiscoveryCycle Model]]

## Gotchas

- Settings page exposes a SSE-streamed variant (`POST /settings/strategy-discovery/run-now`) for incremental progress events — this admin endpoint is the simpler "wait until done" path.

## See also

- [[_index]]
- [[Strategy Auto-Discovery Cycle]]
