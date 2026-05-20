---
tags: [frontend, routes, admin]
---

# Admin Routes

> Superuser-only pages: database inspector, backup, logs, data management.

## Source

- `frontend/src/routes/admin/database.tsx`
- `frontend/src/routes/admin/backup.tsx`
- `frontend/src/routes/admin/logs.tsx`
- `frontend/src/routes/admin/data-management.tsx`

## How it works

Every admin route calls `requireAdmin()` in `beforeLoad` (see [[Route Guards]]):
redirects to login if not authenticated, redirects to `/` if not a superuser
(unless `import.meta.env.DEV`). [[Sidebar]] shows the `adminGroup` items under
the same condition. The four pages mirror backend admin endpoints — collection
browser, mongodump/restore, log viewer, and bulk data delete/export.

## Depends on

- [[Route Guards]]
- [[authStore]]
- [[DataTable]]

## See also

- [[_index]]
- [[Sidebar]]
