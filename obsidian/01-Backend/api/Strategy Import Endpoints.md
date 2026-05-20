---
tags: [backend, api, strategies, ai]
---

# Strategy Import Endpoints

> Two-step extract-then-confirm flow at `/strategies/import` for manual strategy ingest from URL or file.

## Source

- `backend/app/api/v1/strategy_import.py`

## How it works

Step 1 (extract): the client POSTs either a URL or a multipart file. [[Content Reader]] fetches/parses the content, then [[StrategyExtractor]] returns an `ExtractedStrategyResponse` (preview only — nothing is persisted yet). The response includes `extraction_messages` so the chat UI can replay status bubbles. The user reviews + edits the fields in the form.

Step 2 (confirm): the client POSTs the (possibly edited) payload to `/confirm`, which:

1. Inserts a [[StrategyKnowledge Model]] with embedding via `StrategyEmbeddingGenerator`.
2. Inserts a `Strategy` shadow row owned by the user (`auto_discovered=False`).
3. Returns `{strategy_id, knowledge_id}`.

## Endpoints

- `POST /strategies/import/url/extract` — fetch + AI extract (preview)
- `POST /strategies/import/file/extract` — upload + AI extract (preview)
- `POST /strategies/import/confirm` — persist [[Strategy Model]] + [[StrategyKnowledge Model]]

## Depends on

- [[Content Reader]]
- [[StrategyExtractor]]
- [[StrategyKnowledge Model]]
- [[Strategy Model]]

## Gotchas

- Registered BEFORE `/strategies` so `import` is not parsed as a strategy id — see [[Router Registration Order]].

## See also

- [[_index]]
- [[Strategy Discovery Service]]
