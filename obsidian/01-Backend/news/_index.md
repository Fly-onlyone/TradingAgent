---
tags: [backend, news, moc]
---

# News Module — MOC

> Map of `backend/app/news/` — RSS crawling, dedup, Claude summarisation, and
> source-credibility scoring. Feeds the agent with fresh market context and is
> the upstream of [[Strategy Auto-Discovery Cycle]] when sources flag
> `strategy_extraction=True`.

## Source

- `backend/app/news/` (5 modules + `__init__.py`)

## How it works

`NewsScheduler` (APScheduler) drives two recurring jobs: a 15-minute crawl-all
pass and a 6-hour credibility-score refresh. The crawler pulls RSS via
`feedparser`, deduplicates by URL + content hash, enriches short articles with
full-page extraction (`trafilatura`), and stores `NewsArticle` documents with
embeddings + extracted assets. The summariser then attaches a Claude-generated
summary, sentiment score, and relevance score. The credibility scorer adjusts
each `NewsSource`'s reputation based on historical prediction accuracy.

## Notes in this folder

- [[RSS Crawler]]
- [[Credibility Scorer]]
- [[News Deduplicator]]
- [[News Summarizer]]
- [[News Scheduler]]

## See also

- [[Strategy Auto-Discovery Cycle]]
- [[NewsArticle Model]] · [[NewsSource Model]] · [[CredibilityEvent Model]]
- [[News Tools]] · [[Source Discovery]] · [[Article Fetcher]]
