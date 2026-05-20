---
tags: [backend, db, model]
---

# NewsSource Model

> News publisher with credibility score, crawl configuration, and the `strategy_extraction` flag that gates [[Strategy Auto-Discovery Cycle]].

## Source

- `backend/app/db/models/news.py` — `NewsSource`
- Collection: `news_sources`

## Key fields

- `name`, `domain` (unique), `source_type` (`NewsSourceType`), `description`
- `credibility_score` (0..1), `accuracy_history`, `bias_rating`
- Crawling: `rss_url`, `crawl_enabled`, `crawl_interval_hours`, `strategy_extraction`, `auto_discovered`
- `last_crawled`, `last_error`

## Used by

- News crawler scheduler
- [[Strategy Auto-Discovery Cycle]] — filters sources where `strategy_extraction=True`

## Special features

- `field_validator` normalizes legacy source-type aliases (`major-news`, `official_news`, …)
- Compound indexes on `(crawl_enabled, credibility_score DESC)` and `(source_type, credibility_score DESC)`

## See also

- [[_index]]
- [[NewsArticle Model]]
- [[CredibilityEvent Model]]
