---
tags: [backend, security, pattern]
---

# Secret Resolver

> One-liner helper that gives DB-stored secrets precedence over their `.env` fallback — the canonical "where does this API key come from?" pattern.

## Source

- `backend/app/security/resolver.py` — `resolve_secret()`

## How it works

```python
def resolve_secret(db_getter: Callable[[], str], env_value: str) -> str:
    return db_getter() or env_value
```

That's the whole file. Every settings endpoint in `app/api/v1/settings.py` follows the same pattern: pass a bound `AppSettings.get_okx_api_key` (which decrypts the stored value via [[Fernet Encryption]]) plus the `Settings.okx_api_key` env-var fallback. If the DB value is empty, the env var wins — that's how local dev and Sentry/OKX/Brave/Anthropic keys can be set either through the UI or `.env`.

## Depends on

- [[AppSettings Model]] — provides the `db_getter` accessors
- [[App Settings]] — provides the env fallbacks

## Used by

- `app/api/v1/settings.py` — Sentry, OKX, Brave, Anthropic, Apprise key lookups
- Service factories (`StrategyExtractor.create()`, `TradeLearner.create()`, …)

## See also

- [[_index]]
- [[AppSettings Model]]
