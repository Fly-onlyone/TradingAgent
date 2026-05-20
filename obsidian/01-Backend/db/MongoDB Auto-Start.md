---
tags: [backend, db]
---

# MongoDB Auto-Start

> `_ensure_mongodb_running()` pings MongoDB at startup and starts the local service / `mongod` binary on Windows when it's down.

## Source

- `backend/app/db/session.py` — `_ensure_mongodb_running()`

## How it works

The helper opens a short-timeout (2s) Motor client and runs `admin.command("ping")`. On `ServerSelectionTimeoutError` and Windows, it first tries `net start MongoDB` (the service path), then falls back to launching `mongod.exe` directly from `MONGODB_MONGOD_PATH`, `shutil.which("mongod")`, or hard-coded Program Files paths (8.2 / 8.0 / 7.0). The subprocess is detached with `CREATE_NO_WINDOW` so it survives the FastAPI process. If nothing works it raises `RuntimeError` with config guidance.

## Depends on

- [[App Settings]] — `mongodb_url`, `mongodb_mongod_path`, `mongodb_data_dir`

## Used by

- [[document_models Registration]] — called first in `init_db()`
- [[Background Service Startup]]

## Gotchas

- On non-Windows platforms, a down MongoDB still raises — there's no Linux equivalent attempt.
- Falls back path-by-path; the first existing binary wins.

## See also

- [[_index]]
- [[MongoDB]]
