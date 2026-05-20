---
tags: [backend, api, logs, admin]
---

# Logs Endpoints

> Admin log viewer at `/admin/logs` plus an unauthenticated frontend log-push at `/logs/frontend`.

## Source

- `backend/app/api/v1/logs.py` (admin)
- `backend/app/api/v1/client_logs.py` (frontend ingest)

## How it works

Admin: `GET /admin/logs` queries [[LogRecord Model]] with filters (`level`, `module`, `logger_name`, `request_id`, time range) and converts timestamps via `to_local_datetime()`. `GET /admin/logs/stats` aggregates `total_count`, per-level, and per-module counts. Both require superuser.

Frontend ingest: `POST /logs/frontend` accepts a single client-side log record (level, message, optional traceback, `page_url`, `user_agent`). It validates `level` against an allowlist, stamps `request_id` from header or body, and inserts a `LogRecord`. Returns `202` to confirm acceptance. No auth — production deployments should reverse-proxy with rate-limiting.

## Endpoints

- `GET /admin/logs` — paginated, filterable
- `GET /admin/logs/stats` — counts
- `POST /logs/frontend` — frontend log ingest (no auth, returns 202)

## Depends on

- [[LogRecord Model]]
- [[Request Logging Pipeline]]

## See also

- [[_index]]
