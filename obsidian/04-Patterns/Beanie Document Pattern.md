---
tags: [pattern]
---

# Beanie Document Pattern

> Backend models subclass Beanie `Document` and declare a `class Settings` for collection name + indexes.

## When to apply

Every new MongoDB-backed model in `backend/app/db/models/`.

## The pattern

```python
from beanie import Document
from pymongo import IndexModel, ASCENDING

class Log(Document):
    level: str
    logger_name: str
    message: str
    created_at: datetime

    class Settings:
        name = "logs"
        indexes = [
            IndexModel([("created_at", ASCENDING)]),
            IndexModel([("logger_name", ASCENDING)]),
        ]
```

Then register in `backend/app/db/session.py` `document_models` list.

## Why

Beanie discovers collection names and indexes via the `Settings` inner class. Forgetting to register the model in `session.py` causes silent runtime failures on first query.

## Don't

- Don't hardcode collection names in queries — use `Document` methods
- Don't forget to add the model to `document_models`

## See also

- [[_index]]
- [[Beanie ODM]]
