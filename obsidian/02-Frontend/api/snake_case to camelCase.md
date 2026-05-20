---
tags: [frontend, api, pattern]
---

# snake_case to camelCase

> The transform is **per-endpoint, not a generic middleware** — each endpoint file owns `transformXxx()` functions that map API response objects into the camelCase TS types.

## Source

- `frontend/src/api/endpoints/*.ts` (every transform lives next to the call site)

## How it works

The Python/FastAPI backend uses `snake_case` field names; the frontend uses `camelCase`. Each endpoint declares small typed transformers, e.g. `transformTrade(data) → TradeWithPnL`, called inside the API method. Reverse-direction (camel → snake) is done inline in PATCH/POST payload construction: `payload.entry_rules = data.entryRules`. This keeps types localized — there is no global codegen and no axios transform layer. Field-by-field also lets transforms inject defaults (e.g. `[] ?? data.symbols`).

## Used by

- All endpoint modules — see [[Endpoint Modules]]

## See also

- [[_index]]
- [[HTTP Client Interceptor]]
