---
tags: [integrations]
---

# Pydantic

> Data validation library used everywhere — Beanie models, FastAPI request/response schemas, app settings.

## Used for

- Request and response schemas for all API endpoints ([[Pydantic Request Response Schemas]])
- [[Beanie ODM]] Document models inherit from Pydantic `BaseModel`
- `pydantic-settings` for env-driven configuration

## Configuration

- `pydantic[email]>=2.0.0`, `pydantic-settings>=2.0.0`
- Context7 ID: `/pydantic/pydantic`

## Gotchas

- Pydantic v2 has stricter coercion than v1 — datetime parsing in particular

## See also

- [[_index]]
- [[FastAPI]]
- [[Beanie ODM]]
