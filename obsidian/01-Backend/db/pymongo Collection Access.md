---
tags: [backend, db, pattern]
---

# pymongo Collection Access

> Use `Model.get_pymongo_collection()` for raw aggregations and bulk ops — `get_motor_collection()` is the deprecated path.

## Source

- Beanie API exposed on every `Document` subclass
- Usage pattern: `await Model.get_pymongo_collection().aggregate(pipeline).to_list(...)`

## How it works

Beanie keeps both a Motor and a PyMongo handle per registered document. The PyMongo handle is the async-friendly accessor for raw pipelines, bulk writes, and `$facet` queries that Beanie's high-level builders can't express. Examples: `_vectorized_search()` in `retriever.py` projects `_id` + `embedding` only; `delete_session_message_history()` runs `delete_many({"session_id": ...})`. Beanie's older `get_motor_collection()` is deprecated and emits a warning — always pick the pymongo accessor in new code.

## Depends on

- [[Beanie ODM]]
- [[Motor Async Driver]]

## Used by

- [[RAG Retrieval Pipeline]]
- Aggregation endpoints in `backend/app/api/v1/`

## Gotchas

- Projection-optimized queries return raw `dict`s, not `Document` instances — re-fetch by `_id` when you need typed models.

## See also

- [[_index]]
- [[Beanie Document Models Overview]]
