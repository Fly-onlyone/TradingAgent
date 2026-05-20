---
tags: [backend, api, moc]
---

# API (MOC)

> Map of `backend/app/api/` — REST under `/api/v1` and WebSocket channels under `/ws`.

## Source

- `backend/app/api/v1/`
- `backend/app/api/websocket/`

## How it works

FastAPI `APIRouter` instances are aggregated in `backend/app/api/v1/__init__.py` and mounted under `/api/v1`. Every router uses Beanie `Document` models for persistence and the shared `get_current_active_user` / `get_current_superuser` dependencies from [[Auth Endpoints]] and `app.api.deps`. WebSocket channels rely on the in-process [[WS Connection Manager]] for fanout. Routing is order-sensitive — see [[Router Registration Order]].

## REST endpoints

- [[Router Registration Order]]
- [[Auth Endpoints]]
- [[Users Endpoints]]
- [[Orders Endpoints]]
- [[Strategies Endpoints]]
- [[Strategy Import Endpoints]]
- [[Strategy Ratings Endpoints]]
- [[Knowledge Endpoints]]
- [[News Endpoints]]
- [[Market Endpoints]]
- [[Dashboard Endpoints]]
- [[Agent Tasks Endpoints]]
- [[Agent Sessions Endpoints]]
- [[Agent Decisions Endpoints]]
- [[Agent Memories Endpoints]]
- [[Notifications Endpoints]]
- [[Settings Endpoints]]
- [[Logs Endpoints]]
- [[Backup Endpoints]]
- [[Admin Endpoints]]
- [[Strategy Discovery Admin Endpoints]]

## WebSocket channels

- [[Agent WS Channel]]
- [[Market WS Channel]]
- [[Orders WS Channel]]
- [[WS Connection Manager]]

## See also

- [[JWT Auth Flow]]
- [[Request Logging Pipeline]]
- [[Rate Limiting]]
