---
tags: [frontend, store, auth]
---

# authStore

> Holds the current `User`, JWT token, and auth flags; persisted to localStorage as `auth-storage`.

## Source

- `frontend/src/store/authStore.ts`

## How it works

`login(user, token)` calls `setAccessToken(token)` on the axios client and seeds Sentry user context. `updateToken(token)` is called by the [[HTTP Client Interceptor]] after a transparent refresh — only the token changes, the user stays. `logout()` clears both the token and Sentry user. `partialize` persists `user`, `token`, `isAuthenticated` only; `isLoading` resets each load. `onRehydrateStorage` re-runs `setAccessToken` so the axios client has the token before the first API call.

## Depends on

- `@/api/client` (`setAccessToken`)

## Used by

- [[useAuth]]
- [[HTTP Client Interceptor]]
- [[useAgentSocket]]

## See also

- [[_index]]
- [[JWT Auth Flow]]
