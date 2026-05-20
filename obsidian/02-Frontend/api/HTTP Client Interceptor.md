---
tags: [frontend, api, auth]
---

# HTTP Client Interceptor

> Axios instance with two interceptors: request adds `Authorization: Bearer`, response auto-refreshes on 401 before logging the user out.

## Source

- `frontend/src/api/client.ts`

## How it works

`baseURL` is resolved from `getApiBaseUrl()` (Tauri vs browser). Token lives in module-local `accessToken`, set via `setAccessToken()` from [[authStore]]. On a `401`, the response interceptor checks if the URL is in `NO_REFRESH_URLS` (auth endpoints — refusing prevents infinite loops). Otherwise it POSTs `/auth/refresh`; while in flight, concurrent 401s are pushed into `failedQueue` and resolved with the new token. After refresh, the original request is retried with the new bearer; on refresh failure, `forceLogout()` clears the store. 500-class errors are also captured by Sentry with API tags.

## Used by

- Every `api/endpoints/*.ts` module
- [[authStore]] (via `setAccessToken`)

## See also

- [[_index]]
- [[JWT Auth Flow]]
