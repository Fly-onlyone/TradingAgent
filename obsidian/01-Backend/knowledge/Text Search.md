---
tags: [backend, knowledge]
---

# Text Search

> Lexical companion to vector search — MongoDB `$text` index lookup that contributes
> a second ranking stream to RRF fusion.

## Source

- `backend/app/knowledge/retriever.py` (`_text_search`)

## How it works

Runs `find({"$text": {"$search": query}}, {"score": {"$meta": "textScore"}})`
sorted by text score, optionally merged with an `extra_filter` (e.g. `symbol`,
`pattern_type`, `mentioned_assets`). Returns full Beanie documents in MongoDB's
score order, with the score itself discarded — only the *rank* matters for the
downstream RRF merge. If the collection has no text index (or the query parser
chokes on the input), the function swallows the exception and returns `[]`
so vector results still flow through.

## Depends on

- MongoDB `$text` indexes declared in each model's `class Settings` (e.g. `StrategyKnowledge`, `NewsArticle`).

## Used by

- [[Hybrid Retriever]] (parallel with [[Vector Search]])
- [[Reciprocal Rank Fusion]] (consumer of the text ranking)

## Gotchas

- MongoDB allows only one `$text` index per collection — adding fields requires dropping/rebuilding.
- Stemming and stop-word handling are MongoDB's defaults (English).

## See also

- [[_index]]
- [[Vector Search]]
- [[RAG Retrieval Pipeline]]
