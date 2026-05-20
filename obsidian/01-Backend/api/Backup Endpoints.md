---
tags: [backend, api, admin, backup]
---

# Backup Endpoints

> Superuser-only full-database export/import under `/admin/backup`.

## Source

- `backend/app/api/v1/backup.py`

## How it works

`GET /info` enumerates collection names, document counts, and storage size via `collStats`. `POST /export` streams a single JSON file built with `bson.json_util.dumps()` so ObjectIds and dates round-trip correctly. `POST /import` accepts a multipart upload, parses the same `json_util` format, and re-inserts documents collection-by-collection. System collections (`system.*`) are skipped. Returns `{status, collections_restored, total_documents}`.

## Endpoints

- `GET /admin/backup/info` — sizes + counts
- `POST /admin/backup/export` — streaming JSON bundle
- `POST /admin/backup/import` — restore from a JSON bundle

## Depends on

- `app.db.session.get_db`
- `bson.json_util`

## Gotchas

- Import does not truncate collections first — it appends. Use the admin `/bulk-clear` (see [[Admin Endpoints]]) before restoring to a clean DB.

## See also

- [[_index]]
