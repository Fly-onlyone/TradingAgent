---
tags: [backend, security]
---

# Fernet Encryption

> Encrypt/decrypt app-managed secrets at rest using Fernet (AES-128-CBC + HMAC-SHA256), with multi-key support for rotation via the `enc:v1:` marker prefix.

## Source

- `backend/app/security/secrets_crypto.py`

## How it works

`encrypt_secret_value()` returns `enc:v1:<token>` so stored values are self-describing. `decrypt_secret_value()` short-circuits to passthrough when the marker is absent (legacy plaintext). A cached `MultiFernet` is built from `get_required_encryption_keys()` — the first key encrypts, **every** configured key is tried on decrypt, so adding a new key + redeploying is the rotation path. Failures raise `SecretEncryptionError` (config) or `SecretDecryptionError` (wrong key / corrupt token). Comment notes that a `v2` scheme using AES-256-GCM is the future path if compliance demands AES-256.

## Depends on

- [[Key Provider]] — supplies the comma-separated keys
- [[Fernet]] (`cryptography` library)

## Used by

- [[AppSettings Model]] — wraps every `_get_secret_value()` / `_set_secret_value()`
- Validation gate in `db/session.py` (`_validate_app_settings_secret_encryption`)

## Gotchas

- `SECRETS_ENCRYPTION_KEYS` env var is comma-separated; **first key encrypts, all decrypt** — rotation = prepend a new key, redeploy, re-encrypt, drop the old key
- `_get_multifernet()` is `lru_cache(maxsize=1)` — call `clear_crypto_cache()` after rotating keys at runtime

## See also

- [[_index]]
- [[Key Provider]]
