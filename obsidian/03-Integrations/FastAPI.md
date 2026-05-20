---
tags: [integrations]
---

# FastAPI

> Async web framework — the backend's HTTP and WebSocket layer.

## Used for

- All REST endpoints under `/api/v1`
- WebSocket connections (agent stream, notifications) — see [[WebSocket Connection Manager]]
- Auto-generated OpenAPI / Swagger docs
- Auto-integration with [[Sentry Backend]] for request context

## Configuration

- `fastapi>=0.115.0`, served by `uvicorn[standard]>=0.30.0`
- Routers registered in `backend/app/api/v1/__init__.py` — order matters (specific prefixes before generic ones)
- Context7 ID: `/tiangolo/fastapi`

## Gotchas

- Sub-prefixes (e.g. `/strategies/import`) must register before their parent (`/strategies`)
- Dev server uses `watchfiles` + subprocess, NOT `uvicorn --reload` (see [[Dev Server Architecture]])

## See also

- [[_index]]
- [[Pydantic]]
- [[Dev Server Architecture]]
