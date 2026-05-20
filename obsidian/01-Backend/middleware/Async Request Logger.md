---
tags: [backend, middleware]
---

# Async Request Logger

> Starlette middleware that stamps every request with a UUID, propagates it through logging context vars + Sentry, and logs method/path/status/duration on the way out.

## Source

- `backend/app/middleware/request_logging.py` — `RequestLoggingMiddleware`

## How it works

`dispatch()` skips a `SKIP_PATHS` allowlist (`/health`, `/docs`, `/openapi.json`, `/redoc`). Otherwise it generates a hex UUID, stuffs it into `request_id_var` (a `ContextVar`) and `sentry_sdk.set_tag("request_id", ...)` so all downstream logs and Sentry events carry it. If a FastAPI dep has set `request.state.user_id`, that flows into `user_id_var` too. `call_next` is timed with `time.perf_counter()`; the response gets an `X-Request-ID` header and logger picks `info` for `<400`, `warning` otherwise. On exception, a 500 log + `exc_info=True` is emitted before re-raise. Context vars are reset in the happy path.

## Depends on

- [[Sentry Logging Integration]] — uses `request_id_var` / `user_id_var` from `app.logging_config`
- [[Sentry Backend]] — `sentry_sdk.set_tag`

## Used by

- FastAPI app (registered in `main.py`)
- [[Request Logging Pipeline]]

## Gotchas

- Context vars are only reset on the success path — exceptions leak the previous request id until the next dispatch overwrites it (acceptable per-request lifecycle).

## See also

- [[_index]]
- [[Request Logging Pipeline]]
