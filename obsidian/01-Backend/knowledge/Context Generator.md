---
tags: [backend, knowledge]
---

# Context Generator

> Write-time helper that uses Claude Haiku to author a 1-2 sentence "context prefix"
> prepended before embedding — boosts retrieval quality 35-49% (Anthropic research).

## Source

- `backend/app/knowledge/context_generator.py`

## How it works

`generate_context_prefix(doc_type, doc_data)` picks one of four templates
(`strategy`, `lesson`, `pattern`, `news`), formats it with the document's
metadata, and asks `claude-haiku-4-5-20251001` to emit a 1-2 sentence
descriptor of what the doc is and when it would be useful. Output is
trimmed to 500 chars and stored on the document's `context_prefix` field.

At read/write symmetry: the specialised embedding generators in
[[Local Embeddings]] (`StrategyEmbeddingGenerator.format_strategy_text`, etc.)
prepend `Context: {context_prefix}` before all other fields, so the embedded
text always includes the prefix when present. API key resolution goes through
`app.agent.auth.resolve_anthropic_api_key()`; returns `None` (graceful skip)
when no key is configured — embedding still proceeds, just without the prefix.

## Depends on

- [[Anthropic API]] (Haiku)
- [[App Settings]]

## Used by

- Strategy ingestion, lesson writer, pattern detector, news crawler — all write-time only.

## Gotchas

- No subscription-mode fallback here (uses raw `AsyncAnthropic`). When no API key, the prefix is just `None`.
- Don't regenerate on read — the prefix is permanent metadata on the doc.

## See also

- [[_index]]
- [[Local Embeddings]]
- [[RAG Retrieval Pipeline]]
