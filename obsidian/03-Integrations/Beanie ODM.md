---
tags: [integrations]
---

# Beanie ODM

> Async MongoDB ODM built on [[Motor Async Driver]] — defines documents as Pydantic models.

## Used for

- All backend models: `AgentSession`, `AgentSessionMessage`, `Log`, `StrategyKnowledge`, `TradeLesson`, `KnowledgeEdge`, `KnowledgeChunk`, `Order`, `Trade`, etc.
- Models follow the [[Beanie Document Pattern]] — `Document` subclass + `class Settings` for collection name and indexes
- All models must be registered in `backend/app/db/session.py` `document_models` list — unregistered models fail at runtime

## Configuration

- `beanie>=1.26.0` in `pyproject.toml`
- Context7 ID: `/BeanieODM/beanie`

## Gotchas

- Forgetting to register a new model in `session.py` causes silent runtime failures on first query
- Use `get_pymongo_collection()` for raw aggregation, not the deprecated motor variant

## See also

- [[_index]]
- [[MongoDB]]
- [[Beanie Document Pattern]]
