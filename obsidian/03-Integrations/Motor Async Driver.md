---
tags: [integrations]
---

# Motor Async Driver

> Async Python driver for MongoDB — the I/O layer used by [[Beanie ODM]] and direct aggregation queries.

## Used for

- All async MongoDB I/O in the backend
- Direct collection access via `get_pymongo_collection()` for aggregation pipelines (the deprecated `get_motor_collection` is avoided)
- Vector search projections in the [[Hybrid Retriever]] — fetches only `_id` + `embedding` to keep memory low

## Configuration

- Installed via `motor>=3.6.0` in `pyproject.toml`
- Initialized in `backend/app/db/session.py` alongside Beanie

## Gotchas

- On Windows, requires [[ProactorEventLoop]] — `SelectorEventLoop` cannot spawn subprocesses

## See also

- [[_index]]
- [[MongoDB]]
- [[Beanie ODM]]
