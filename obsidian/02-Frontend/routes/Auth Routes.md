---
tags: [frontend, routes, auth]
---

# Auth Routes

> Public auth flows — login, register, password recovery, email verification.

## Source

- `frontend/src/routes/auth/login.tsx`
- `frontend/src/routes/auth/register.tsx`
- `frontend/src/routes/auth/forgot-password.tsx`
- `frontend/src/routes/auth/reset-password.tsx`
- `frontend/src/routes/auth/verify-email.tsx`

## How it works

Every auth page calls `requireGuest()` (see [[Route Guards]]) in its `beforeLoad`
so an already-authenticated user is bounced back to `/`. Forms submit to
`authApi.*` endpoints; on success, the JWT is dropped into [[authStore]] and
[[HTTP Client Interceptor]] starts attaching it to every request.
[[AppShell]] hides the header / sidebar when the path starts with `/auth/`.

## Depends on

- [[authStore]]
- [[useAuth]]
- [[Route Guards]]

## See also

- [[JWT Auth Flow]]
- [[_index]]
