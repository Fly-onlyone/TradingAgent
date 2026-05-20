---
tags: [backend, core]
---

# Rate Limiting

> Shared `slowapi` `Limiter` keyed by remote IP — applied per-endpoint via decorator.

## Source

- `backend/app/core/rate_limit.py`

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

## How it works

The module exports a single `limiter` instance keyed by `get_remote_address` (client IP via `X-Forwarded-For` when behind a proxy, else `request.client.host`). Endpoints decorate handlers with `@limiter.limit("5/minute")` etc., and `main.py` registers `SlowAPIMiddleware` plus an exception handler that converts `RateLimitExceeded` to HTTP 429. There is no per-user keying by design — anonymous endpoints (auth/login, password reset) are the primary consumers.

## Depends on

- `slowapi` package

## Used by

- Auth endpoints (login, password reset) in `app/api/v1/auth/`
- Other public POST endpoints

## Gotchas

- Single in-memory bucket; horizontal scaling out of process would need a Redis backend
- IP-keyed only — share an IP and you share the bucket

## See also

- [[_index]]
- [[JWT Auth Flow]]
