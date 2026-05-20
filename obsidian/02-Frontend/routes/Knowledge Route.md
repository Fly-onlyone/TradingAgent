---
tags: [frontend, routes]
---

# Knowledge Route

> `/knowledge` — RAG corpus browser: news, lessons, strategies, patterns.

## Source

- `frontend/src/routes/knowledge/index.tsx`

## How it works

`requireAuth()` guard. Renders tabs across the four knowledge collections and
exposes a search bar that hits the hybrid retrieval endpoint
(`vector + text → RRF fusion → optional rerank`). Each row shows the relevance
score returned from the backend tuple `(doc, score)`. Embedding context prefixes
are visible in the detail drawer.

## Depends on

- [[React Query Options]]

## See also

- [[_index]]
- [[Memory Route]]
