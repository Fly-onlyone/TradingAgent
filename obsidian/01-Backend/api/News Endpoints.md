---
tags: [backend, api, news]
---

# News Endpoints

> CRUD for `NewsSource`s and read-only access to crawled [[NewsArticle Model]] documents under `/news`.

## Source

- `backend/app/api/v1/news.py`

## How it works

Sources are admin-managed: name, domain, `source_type` (`official`, `major_news`, `news`, `blog`, `social`), `crawl_interval_hours`, and the `strategy_extraction` flag (read by the [[News Scheduler]] / [[Strategy Discovery Service]]). Articles are read-only — the scheduler writes them, the API reads them. `/sentiment-feed` returns a recent stream of articles ordered by `published_at` with sentiment + impact fields for the dashboard ticker.

## Endpoints

- `POST/GET /news/sources` — list/create
- `GET/PATCH/DELETE /news/sources/{id}`
- `GET /news/articles` — paginated list, filterable by source/symbol
- `GET /news/articles/{id}`
- `GET /news/sentiment-feed` — dashboard feed

## Depends on

- `NewsSource` model
- [[NewsArticle Model]]

## See also

- [[_index]]
- [[News Scheduler]]
