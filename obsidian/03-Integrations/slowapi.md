---
tags: [integrations]
---

# slowapi

> FastAPI-compatible rate limiting middleware.

## Used for

- Throttling sensitive endpoints (auth, admin actions) in the [[FastAPI]] app
- Protecting against brute-force attempts on login and 2FA endpoints

## Configuration

- `slowapi>=0.1.9`
- Limiter instance attached to the FastAPI app at startup

## See also

- [[_index]]
- [[FastAPI]]
