---
tags: [frontend, api, admin]
---

# Admin Endpoints (Frontend)

> `adminApi` — database / collection inspector for the admin route.

## Source

- `frontend/src/api/endpoints/admin.ts`

## How it works

`getCollections()` → list of `CollectionInfo` (name, displayName, documentCount, storageSize, indexCount, avgDocumentSize) via `transformCollection`. `getCollectionDocuments(name, filter)` returns paginated docs (raw `Record<string, unknown>` — no transform; admin viewer needs the actual stored field names). `getDocument`, `updateDocument`, `deleteDocument` are by id. `getDatabaseInfo()` returns server-wide stats (host, version, uptime). `bulkClearCollections(names[])` POSTs `/admin/bulk-clear` and returns `{ results, totalDeleted }` for the confirmation dialog.

## Depends on

- [[HTTP Client Interceptor]]

## Used by

- Admin Collections / Database routes via `adminCollectionsQueryOptions`, `adminDocumentsQueryOptions`, `adminDbInfoQueryOptions` from [[React Query Options]]

## See also

- [[_index]]
- [[Admin Endpoints]] (backend)
