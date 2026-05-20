---
tags: [backend, security]
---

# Key Provider

> Single entry point for loading Fernet encryption keys: OS keyring on desktop, settings/env var elsewhere — with auto-migration from `.env` to keyring.

## Source

- `backend/app/security/key_provider.py`

## How it works

`load_encryption_keys()` first checks for `TAURI_APP=1`. On desktop it tries the OS keyring; if absent, it reads `Settings.secrets_encryption_keys` (env / `.env`) and — on a successful keyring write — migrates the key into the keyring via `_migrate_env_to_keyring()`. Server deployments skip the keyring branch entirely. Keys are split on commas and stripped. `get_required_encryption_keys()` raises `SecretKeyProviderError` with a clear "set `SECRETS_ENCRYPTION_KEYS`" hint when nothing is configured.

## Depends on

- [[Keyring Store]]
- [[App Settings]] — supplies `secrets_encryption_keys`

## Used by

- [[Fernet Encryption]] — `_build_multifernet()`

## Gotchas

- Desktop migration is silent on success — check logs to verify it happened (`Migrated encryption key from .env to OS keyring`)
- `clear_key_cache()` is a no-op stub kept for crypto-cache lifecycle compatibility

## See also

- [[_index]]
- [[Fernet Encryption]]
