---
tags: [frontend, utils]
---

# Transformers

> Tiny coercion helpers for API responses — safely parse unknown `number`/`timestamp` values.

## Source

- `frontend/src/utils/transformers.ts`

## How it works

```ts
toNumber(value, fallback = 0)        // string or number → finite number, else fallback
toOptionalNumber(value)              // null/undefined/"" → undefined, else parsed
toTimestamp(value)                   // number, ISO string, or now() as last resort
```

All three accept `unknown` and guard with `Number.isFinite` so they never produce NaN. Used by endpoint files when normalizing raw backend payloads that might serialize numbers as strings (Mongo Decimal128, JSON numeric overflow).

**Note**: the broader `snake_case → camelCase` transformation is NOT in this file — it's done per-endpoint in `frontend/src/api/endpoints/*.ts` files, each owning the mapping for its response shape (more explicit, easier to grep, no runtime reflection).

## Used by

- `api/endpoints/*.ts` response normalizers

## See also

- [[Errors]]
- [[Constants]]
