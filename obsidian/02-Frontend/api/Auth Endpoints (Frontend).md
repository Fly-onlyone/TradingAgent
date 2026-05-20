---
tags: [frontend, api, auth]
---

# Auth Endpoints (Frontend)

> `authApi` — login, register, profile, 2FA, password reset, email verification.

## Source

- `frontend/src/api/endpoints/auth.ts`

## How it works

`login` posts `application/x-www-form-urlencoded` (FastAPI OAuth2 form) with `username` (normalized lowercase email), `password`, optional `client_secret` (TOTP code), and `scope=admin` when `asAdmin: true`. On `requires_2fa` the response is returned without storing — the UI then re-calls with `totpCode`. `getMe`, `updateMe` use the camelCase `transformUser` helper. `refreshToken` and `changePassword` both stash the new token via `handleAuthResponse`. `setup2FA` returns base64 QR data; `verify2FA` / `disable2FA` flip the flag. `logout()` zeros the token without hitting the network.

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- [[useAuth]]
- [[authStore]]

## See also

- [[_index]]
- [[Auth Endpoints]] (backend)
- [[JWT Auth Flow]]
