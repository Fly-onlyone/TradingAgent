---
tags: [backend, agent, tools]
---

# News Tools

> DB-backed news helpers — fetch latest articles, compute sentiment aggregates, and run text/asset searches against the `NewsArticle` collection.

## Source

- `backend/app/agent/tools/news_tools.py`

## How it works

- `get_latest_news(assets, limit)` — sorts `NewsArticle` by `published_at` desc, filtered by `mentioned_assets` (normalized via `normalize_assets`).
- `get_news_sentiment(assets, hours)` — aggregates sentiment over a sliding window. Reports `overall_sentiment`, `weighted_sentiment` (credibility-weighted), per-bucket counts, and top sources.
- `search_news(query, assets, limit)` — text search, used by [[NewsAnalyst]] for breaking-news drilldowns and for historical narrative-continuity checks.

These are all DB queries — none of them hit the web. Real-time crawl results are pulled in by [[Web Search Tools]] (Brave API).

## Depends on

- `NewsArticle`, `NewsSource` document models
- `app.knowledge.retriever.normalize_assets` — symbol normalization

## Used by

- [[NewsAnalyst]]
- [[MCP Tools]] (`mcp_get_latest_news`, `mcp_get_news_sentiment`)

## See also

- [[_index]]
- [[NewsAnalyst]]
- [[Web Search Tools]]
