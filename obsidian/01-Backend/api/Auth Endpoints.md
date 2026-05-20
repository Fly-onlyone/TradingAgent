---
tags: [backend, api, auth]
---

# Auth Endpoints

> JWT-based authentication, password reset, email verification, and TOTP 2FA. Prefix `/auth`.

## Source

- `backend/app/api/v1/auth.py`

## How it works

Tokens carry `sub` (email) + `iat` (issue time). `get_current_user` decodes the token, looks up the [[User Model]] by email, and rejects tokens issued before `password_changed_at`. `get_current_active_user` adds an `is_active` check and sets the Sentry user context. Effective token expiry is resolved DB → env → unlimited via `_get_effective_token_expire_minutes()`. `get_dev_user` returns a fixed `_DEV_USER_ID = 000…000` superuser for `debug + allow_debug_auth_bypass` mode so REST and WebSocket share the same identity. 2FA: setup encrypts the TOTP secret via Fernet, verify activates it, the token endpoint piggybacks the code on the OAuth2 `client_secret` field. Rate-limited per route via slowapi (3/min register, 5/min login, etc.).

## Endpoints

- `POST /register` — create user, fire email verification (advisory)
- `POST /token` — OAuth2 password grant; returns `{requires_2fa: true}` if TOTP enabled and no code given
- `POST /refresh` — re-issue token from a valid one
- `POST /change-password` — sets `password_changed_at` (invalidates older tokens)
- `GET /me` — current user
- `POST /forgot-password` / `POST /reset-password`
- `POST /verify-email` / `POST /resend-verification`
- `POST /2fa/setup` / `POST /2fa/verify` / `POST /2fa/disable`

## Depends on

- [[User Model]]
- [[Email Service]] (`send_password_reset`, `send_email_verification`)
- [[Fernet Encryption]] (TOTP secrets)
- [[Rate Limiting]]

## Used by

- Every other API router via `get_current_active_user`
- [[Agent WS Channel]] via `is_token_revoked_by_password_change`

## See also

- [[_index]]
- [[JWT Auth Flow]]
