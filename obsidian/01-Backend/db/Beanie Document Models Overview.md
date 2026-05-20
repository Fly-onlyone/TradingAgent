---
tags: [backend, db, pattern]
---

# Beanie Document Models Overview

> Every persisted entity inherits from Beanie's `Document`, names its collection via `class Settings`, and is wired into the global `document_models` list.

## Source

- `backend/app/db/models/*.py` — one file per aggregate
- `backend/app/db/session.py` — Beanie init

## How it works

Each model subclasses `Document`, declares Pydantic-typed fields (`Indexed(...)` for simple indexes, `IndexModel` for composite), and nests a `class Settings` exposing `name` (collection), optional `use_state_management = True` (enables `.save()` diffing), `timeseries` (for OHLCV / trades) and `indexes`. Documents created at runtime go through `__init__` validation; `Field(default_factory=lambda: datetime.now(UTC))` is the canonical timestamp default. Beanie inspects each class on `init_beanie` and builds the indexes idempotently.

## Depends on

- [[Beanie ODM]]
- [[Motor Async Driver]]

## Used by

- Every service in `backend/app/services/`
- API routers in `backend/app/api/v1/`

## See also

- [[_index]]
- [[document_models Registration]]
- [[pymongo Collection Access]]
