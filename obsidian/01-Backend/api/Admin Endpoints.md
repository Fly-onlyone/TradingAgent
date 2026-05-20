---
tags: [backend, api, admin]
---

# Admin Endpoints

> Superuser-only MongoDB collection explorer + Sentry test under `/admin`.

## Source

- `backend/app/api/v1/admin.py`

## How it works

A generic MongoDB-MCP-style explorer for the running DB. `/db-info` returns server version, uptime, and totals. `/collections` lists collection stats; `/collections/{name}` paginates raw documents; `/collections/{name}/{doc_id}` reads / updates / deletes a single document. `/bulk-clear` truncates a list of collections — `users` and `app_settings` are in `PROTECTED_COLLECTIONS` and silently rejected. `/sentry-test` calls `sentry_sdk.capture_message()` and `division_by_zero` to verify wiring against [[Sentry Backend]].

## Endpoints

- `POST /admin/sentry-test`
- `GET /admin/db-info`
- `GET /admin/collections` / `…/{name}` / `…/{name}/{doc_id}`
- `PUT/DELETE /admin/collections/{name}/{doc_id}`
- `POST /admin/bulk-clear`

## Depends on

- `app.db.session.get_db`
- [[Sentry Backend]]

## Gotchas

- Registered AFTER `/admin/logs`, `/admin/backup`, `/admin/strategy-discovery` so its `/collections/{name}` catch-all does not capture them. See [[Router Registration Order]].

## See also

- [[_index]]
