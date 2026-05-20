---
tags: [backend, db, model]
---

# LogRecord Model

> Application log entry persisted to MongoDB with a 30-day TTL, written in batches by the async `MongoDBHandler`.

## Source

- `backend/app/db/models/log.py`
- Collection: `logs`

## Key fields

- `timestamp` (local now), `level`, `logger_name`, `message`
- `module`, `function`, `line`
- `request_id`, `user_id` (from `ContextVar`s)
- `extra: dict | None` — tool_name/arguments/etc. from structured loggers
- `traceback`

## Used by

- `MongoDBHandler` in `app/logging_config.py` (buffered async writer)
- Admin log-viewer endpoints
- Production debugging — first stop per CLAUDE.md

## Special features

- **TTL index** on `timestamp` (`expireAfterSeconds=2592000` = 30 days)
- Indexes on `level` and `logger_name` for filtered queries
- `agent.tool` logger has its own dedicated `MongoDBHandler` at INFO level

## See also

- [[_index]]
- [[Sentry Logging Integration]]
