---
tags: [backend, db, pattern]
---

# document_models Registration

> Beanie only knows about models listed in `document_models` — adding a new collection without editing this list silently breaks at runtime.

## Source

- `backend/app/db/session.py` — `init_db()` builds the list and calls `init_beanie(database=_db, document_models=document_models)`

## How it works

`init_db()` imports every model class locally (to avoid circular imports), assembles them into a single `document_models = [User, Order, ..., LogRecord]` list, and hands the list to `init_beanie`. Beanie iterates each class, ensures its collection exists, and creates the declared `indexes` + `timeseries` settings. The list is the single source of truth — `Document.find()` calls on an unregistered class raise `CollectionWasNotInitialized` at first use.

## Depends on

- [[Beanie Document Models Overview]]
- [[Motor Async Driver]]

## Used by

- [[Background Service Startup]] — invoked from FastAPI lifespan

## Gotchas

- New models MUST be added here AND imported, otherwise queries fail at runtime, not startup.
- Order doesn't matter functionally but follow grouping for readability (entities → knowledge → agent → settings).

## See also

- [[_index]]
- [[Time-Series Index Conflict Recovery]]
