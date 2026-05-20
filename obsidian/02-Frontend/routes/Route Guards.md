---
tags: [frontend, routes, auth]
---

# Route Guards

> `requireAuth` / `requireGuest` / `requireAdmin` middleware used in `beforeLoad`.

## Source

- `frontend/src/routes/-guards.ts`

## How it works

`syncAuthState()` first waits for Zustand-persist rehydration (`useAuthStore.persist.onFinishHydration`),
then pushes the token into the axios client and calls `authApi.getMe()` to
validate. The result is memoized via `authSyncPromise` so concurrent guards
share one network call. `requireAuth()` throws `redirect({ to: "/auth/login" })`
on failure; `requireGuest()` redirects authed users to `/`; `requireAdmin()`
additionally checks `user.isSuperuser` (bypassed in `import.meta.env.DEV`).
Files prefixed with `-` are excluded from TanStack's route tree.

## Depends on

- [[authStore]]
- [[HTTP Client Interceptor]]
- `authApi.getMe`

## Used by

- Every route's `beforeLoad`

## See also

- [[JWT Auth Flow]]
- [[Auth Routes]]
