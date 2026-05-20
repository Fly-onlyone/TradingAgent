---
tags: [backend, news]
---

# RSS Crawler

> `feedparser` + `httpx` + `trafilatura` pipeline that turns a `NewsSource`'s
> RSS feed into deduplicated, embedded `NewsArticle` rows.

## Source

- `backend/app/news/crawler.py` (`NewsCrawler`)

## How it works

`crawl_source(source)` fetches `source.rss_url` via a single shared `httpx.AsyncClient`
(30 s timeout, browser User-Agent, follow redirects). `feedparser.parse()` turns the
response body into entries; only the first 20 are processed per pass. Each entry
flows through `_process_rss_entry`:

1. Normalise URL and check [[News Deduplicator]] by URL hash, then content hash.
2. Strip HTML from RSS content with BeautifulSoup; fall back to summary if absent.
3. Parse `published_parsed` / `updated_parsed` to UTC.
4. `_extract_assets()` scans for crypto names (BTC/bitcoin, ETH/ethereum, …) and
   `_extract_keywords()` flags trading-relevant terms (bullish, breakout, ETF, halving, …).
5. Generate an embedding via `NewsEmbeddingGenerator` (which builds structured
   "Title/Summary/Assets/Sentiment/Content" text — see [[Local Embeddings]]).
6. Insert the `NewsArticle`.

`enrich_article()` runs on stub articles (< 500 chars) — it fetches the full URL
and re-extracts content via `trafilatura` for higher-quality embeddings.
`source.last_crawled` / `last_error` are persisted after each pass.

## Depends on

- `feedparser`, `httpx`, `trafilatura`, `beautifulsoup4`
- [[News Deduplicator]]
- [[Local Embeddings]] (NewsEmbeddingGenerator)
- [[NewsArticle Model]] · [[NewsSource Model]]

## Used by

- [[News Scheduler]]
- [[Strategy Auto-Discovery Cycle]] (when source has `strategy_extraction=True`)

## See also

- [[_index]]
- [[Article Fetcher]] · [[Source Discovery]]
