---
tags: [backend, api, routing]
---

# Router Registration Order

> Order of `router.include_router()` calls in `api/v1/__init__.py` is load-bearing — more-specific prefixes MUST be registered before more-generic ones.

## Source

- `backend/app/api/v1/__init__.py`

## How it works

FastAPI matches mounted routers in registration order. Two collisions matter here:

1. **Sub-prefixes before parents.** `/strategies/import` and `/strategies/ratings` are registered BEFORE `/strategies` — if reversed, `strategies.router`'s `/{strategy_id}` catch-all would swallow `import` and `ratings` as PydanticObjectId path params and 404 every request.
2. **Specific admin paths before `/admin`.** `/admin/logs`, `/admin/backup`, and `/admin/strategy-discovery` are registered BEFORE the generic `admin` router. If `admin` came first, its collection-name path params would absorb the sub-routes.

Mount path: `app.include_router(api_v1.router, prefix="/api/v1")` in `backend/app/main.py`.

## Endpoints

(no endpoints — this is the registration manifest)

## Depends on

- All routers listed in [[_index]]

## Gotchas

- When adding a new sub-prefix like `/agent/runs`, register it **before** any router whose prefix is a prefix-string of yours.

## See also

- [[_index]]
