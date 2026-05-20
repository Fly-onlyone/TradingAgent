---
tags: [backend, security]
---

# Keyring Store

> Persists encryption keys in the OS keyring (Windows Credential Manager / macOS Keychain / libsecret) for the **desktop** build, so the user never has to manage a `.env` secret.

## Source

- `backend/app/security/keyring_store.py`

## How it works

`load_from_keyring()` / `save_to_keyring()` / `delete_from_keyring()` lazily import the `keyring` package and read/write `service="trading-agent"` + `account="secrets-encryption-keys"`. `remove_encryption_key_from_env_file()` comments out the `SECRETS_ENCRYPTION_KEYS=...` line in the desktop `.env` once migration to the keyring succeeds, leaving a `# Migrated to OS keyring` marker. All keyring operations are wrapped in try/except — missing backend or permission errors return `None`/`False` so the app falls back to env-var loading instead of crashing.

## Depends on

- [[Key Provider]] — sole caller (desktop-only path)
- `keyring` Python package (lazy import)

## Used by

- [[App Settings]] — bootstrap branch when `TAURI_APP=1` and key isn't set

## Gotchas

- Only invoked when `TAURI_APP` env var is set — server deployments never touch the keyring
- Migration is one-way; deleting the keyring entry doesn't restore the `.env` line

## See also

- [[_index]]
- [[Key Provider]]
