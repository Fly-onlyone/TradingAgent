---
tags: [backend, news]
---

# News Scheduler

> APScheduler driver for the news pipeline — runs a 15-minute crawl across all
> enabled sources plus a 6-hour credibility refresh.

## Source

- `backend/app/news/scheduler.py` (`NewsScheduler`)

## How it works

`start()` boots an `AsyncIOScheduler`, then registers two jobs:

1. **Credibility refresh** — direct `add_job(IntervalTrigger(hours=6))` calling
   `_update_credibility_scores`, which iterates every `NewsSource` and calls
   [[Credibility Scorer]] `update_source_score`. No DB-driven toggle since
   it's cheap and always wanted.
2. **Crawl-all** — wrapped in a `PeriodicJob` descriptor (`PeriodicJobManager`
   from `app.agent.scheduling`) at 15-minute intervals, stamping
   `news_crawl_last_run_at` so multi-process or crashed runs don't double-fire.
   `_crawl_all_sources` iterates `NewsSource.find({"crawl_enabled": True})`,
   skips any whose `last_crawled` is within `crawl_interval_hours`, then for
   each new article runs [[RSS Crawler]] → `enrich_article` → [[News Summarizer]]
   (summary, sentiment, relevance) and saves.

`fire_when_settings_unavailable=True` ensures startup crawls happen even if
the DB hiccups. `crawl_source_now(source_id)` lets API endpoints kick a single
source on demand. `get_status()` returns scheduler state for the admin UI.

## Depends on

- `apscheduler.schedulers.asyncio.AsyncIOScheduler`
- [[RSS Crawler]] · [[News Summarizer]] · [[Credibility Scorer]]
- [[App Settings]] (`news_crawl_last_run_at`)

## Used by

- [[Background Service Startup]]
- [[Strategy Auto-Discovery Cycle]] (consumes the articles this writes)

## See also

- [[_index]]
- [[Strategy Auto-Discovery Cycle]]
