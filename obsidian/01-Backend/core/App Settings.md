---
tags: [backend, core]
---

# App Settings

> Pydantic `BaseSettings` instance loaded from env / `.env` — env-only config (DB URL, secret keys, Sentry, OKX env-fallback, log paths).

## Source

- `backend/app/config.py` — `Settings`, `get_settings()` (lru_cached)

## How it works

`Settings` extends `pydantic_settings.BaseSettings` with `env_file=".env"`. The `APP_ENV_FILE` env var overrides the default `.env` path (used by the Tauri desktop entry to point at the user's profile dir). `_validate_security` runs as a post-model validator:

- On desktop (`TAURI_APP=1`) it auto-generates `SECRET_KEY` and persists it to the env file when missing — keeping JWT signatures stable across restarts.
- Same path for `SECRETS_ENCRYPTION_KEYS`: try OS keyring → fall back to env-file write.
- Non-debug deployments raise if `SECRET_KEY` is missing/placeholder.
- Warns when MongoDB URI lacks auth.

Precedence for any secret: env var > `.env` file. The DB-vs-env fallback for app-managed keys lives in [[Secret Resolver]].

## Depends on

- [[Keyring Store]] (desktop bootstrap)

## Used by

- Almost every module (`get_settings()` is the canonical accessor)
- [[Sentry Logging Integration]]
- [[Background Service Startup]]

## See also

- [[_index]]
- [[AppSettings Model]] — DB-side runtime settings (different concept)
- [[Secret Resolver]]
