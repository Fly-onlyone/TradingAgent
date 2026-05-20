---
tags: [backend, db, model]
---

# User Model

> User account document — owns authentication, TOTP, default trading config, and password-changed-at for token invalidation.

## Source

- `backend/app/db/models/user.py`
- Collection: `users`

## Key fields

- `email` (unique indexed `EmailStr`), `hashed_password`, `full_name`
- `is_active`, `is_superuser`
- `default_symbol`, `default_timeframe` — chart defaults
- `totp_secret`, `totp_enabled` — 2FA
- `password_changed_at` — drives JWT `iat` invalidation
- `email_verified`, `verification_token_hash`, `reset_token_hash`, `reset_token_expires`

## Used by

- [[JWT Auth Flow]] — token issuance & refresh
- Every endpoint that resolves the current user
- [[Strategy Auto-Discovery Cycle]] (resolves superuser for shadow `Strategy` docs)

## Special features

- `use_state_management = True` — `.save()` only ships changed fields
- Stable timestamps via `created_at` / `updated_at` (`update_timestamp()` helper)

## See also

- [[_index]]
- [[JWT Auth Flow]]
