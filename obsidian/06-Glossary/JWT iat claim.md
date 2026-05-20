---
tags: [glossary]
---

# JWT iat claim

`iat` is the JWT "issued at" timestamp. Used here for **bulk token invalidation on password change**: when a user calls `POST /auth/change-password`, the server records `password_changed_at` on the user document. Subsequent requests reject any token whose `iat` is older than that timestamp — effectively invalidating every previously issued token. See [[JWT Auth Flow]].

## See also

- [[_index]]
- [[JWT Auth Flow]]
