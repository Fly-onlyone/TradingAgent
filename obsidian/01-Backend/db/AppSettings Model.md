---
tags: [backend, db, model, security]
---

# AppSettings Model

> **Singleton** runtime configuration with Fernet-encrypted secret fields, lazy plaintext migration, and conflict-resolution helpers.

## Source

- `backend/app/db/models/app_settings.py`
- Collection: `app_settings` (singleton via partial-unique index on `singleton_key`)

## Key fields

- Singleton: `SINGLETON_KEY = "app_settings"`, partial-unique index
- **Encrypted secrets**: `agent_api_key`, `okx_api_key`, `okx_secret_key`, `okx_passphrase`, `brave_search_api_key`, `email_url`, `notification_urls_encrypted`
- Agent: `agent_auth_mode` (`subscription`/`api_key`), `agent_model`, `agent_thinking_mode`, `agent_thinking_budget`, `agent_effort`
- OKX: sandbox toggle
- Discovery: `auto_discover_*` flags, `auto_discover_max_parallel_extractions`
- `emergency_stop_active` (runtime latch, NOT a user toggle)
- `session_retention_days`, `pattern_mining_*`, `news_crawl_last_run_at`, `reranking_enabled`, `defer_embedding_when_gaming`, `gaming_process_list`

## Special features

- `get_instance()` — fetches singleton, calls `migrate_plaintext_secrets_if_needed()` automatically
- `ensure_singleton_document()` — picks newest by `updated_at`, merges secrets from duplicates, archives losers to `app_settings_conflicts`
- `has_persisted_secret_values()` — used by startup gate
- `migrate_plaintext_secrets_if_needed()` — encrypts legacy plaintext secrets in-place
- `get_undecryptable_secret_fields()` / `clear_secret_fields()` — desktop recovery path
- Per-secret `get_*()` / `set_*()` decrypt/encrypt via [[Fernet Encryption]]

## Used by

- Every secret-resolving service (OKX, Anthropic, Brave, Apprise)
- [[Background Service Startup]] — validates encryption at boot
- Admin settings UI

## See also

- [[_index]]
- [[Fernet Encryption]]
- [[Secret Resolver]]
