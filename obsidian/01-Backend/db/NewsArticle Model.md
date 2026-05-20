---
tags: [backend, db, model, rag]
---

# NewsArticle Model

> Crawled news article with content hashes for dedupe, AI sentiment/relevance, mentioned-asset tags, and embedding for RAG.

## Source

- `backend/app/db/models/news.py` — `NewsArticle`
- Collection: `news_articles`

## Key fields

- `source_id` → [[NewsSource Model]], `url` (unique), `url_hash`, `content_hash`
- `title`, `content`, `summary` (AI)
- `sentiment_score` (-1..1), `relevance_score` (0..1), `mentioned_assets`, `keywords`
- Prediction tracking: `predicted_impact`, `actual_impact`, `prediction_verified`
- `context_prefix`, `embedding` (768-dim)
- `published_at`, `fetched_at`

## Used by

- News crawler service
- [[RAG Retrieval Pipeline]] — 24h time-decay half-life
- [[Strategy Auto-Discovery Cycle]]
- [[Knowledge Graph Edges]] — `MENTIONS` to assets

## Special features

- Multiple compound indexes by `(source_id, published_at)`, `(mentioned_assets, published_at)`, `(relevance_score, published_at)`
- TEXT index over `(title, summary)`

## See also

- [[_index]]
- [[NewsSource Model]]
