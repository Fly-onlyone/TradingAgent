---
tags: [frontend, hooks, auth]
---

# useAuth

> Wraps `authApi` + [[authStore]] + router; exposes `login`, `register`, `logout` plus the current `user` / `isAuthenticated` flags.

## Source

- `frontend/src/hooks/useAuth.ts`

## How it works

`handleLogin` calls `authApi.login`, short-circuits on `requires_2fa`, fetches `/auth/me`, then `login()`s the store and navigates to `/`. Errors are surfaced via `notify.error` and rethrown so the form can display them. `handleRegister` posts and redirects to `/auth/login`. `handleLogout` clears the local token (`authApi.logout()` resets axios state), then `authStore.logout()` and routes to login. A second hook, `useRequireAuth`, runs in routes that should redirect unauthenticated users.

## Depends on

- [[authStore]]
- `@/api/endpoints/auth` (see [[Auth Endpoints]])

## See also

- [[_index]]
- [[JWT Auth Flow]]
