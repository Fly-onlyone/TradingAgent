---
tags: [backend, core, observability]
---

# Sentry Logging Integration

> Sentry SDK init wires the Python `logging` module into Sentry: **INFO+ becomes breadcrumbs, ERROR+ becomes events**, and request context vars flow through every log line.

## Source

- `backend/app/main.py` — `sentry_sdk.init(...)` with `LoggingIntegration`
- `backend/app/logging_config.py` — handlers, formatters, `request_id_var`, `user_id_var`

## How it works

`setup_logging()` configures a coloured console handler, a rotating JSON-lines file handler (`logs/app.jsonl`), and a buffered async `MongoDBHandler` writing WARNING+ to the `logs` collection. A second dedicated `MongoDBHandler` writes the `agent.tool` logger at INFO level. Sentry is initialised conditionally when `settings.sentry_dsn` is set, with `LoggingIntegration(level=INFO, event_level=ERROR)` — so breadcrumbs gather context and only ERROR+ records become Sentry events. `traces_sampler` + `before_send_transaction` drop SPA catch-all routes; `request_id` is attached via the [[Async Request Logger]].

## Depends on

- [[App Settings]] — `sentry_dsn`, `sentry_environment`, `sentry_traces_sample_rate`, …
- [[LogRecord Model]] — destination for the async Mongo handler

## Used by

- Every logger in the app (via root + named loggers)
- [[Async Request Logger]] populates `request_id_var` for downstream logs

## Gotchas

- Mongo handlers must be **started** after the event loop is up — `start_all_mongo_handlers()` is called from the FastAPI lifespan
- Stale handlers are cleared on `setup_logging()` so reloads don't double-log

## See also

- [[_index]]
- [[Sentry Backend]]
- [[Request Logging Pipeline]]
