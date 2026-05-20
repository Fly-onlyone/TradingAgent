---
tags: [backend, services, ingest]
---

# Article Fetcher

> Shared async HTTP-fetch + trafilatura extraction for discovery and explorer tools.

## Source

- `backend/app/services/article_fetcher.py`

## How it works

`fetch_article(url, *, title="")` opens an `httpx.AsyncClient` with a desktop User-Agent and 15s timeout, follows redirects, and pipes the HTML body through `trafilatura.extract(include_comments=False, include_tables=False)`. Returns a `FetchedArticle` dataclass with `url`, `title`, `content`, and an `error` string. Network errors and empty extraction both surface as `content=""` + a populated `error` field so callers can log + skip without try/except.

## Depends on

- `httpx`, `trafilatura`

## Used by

- [[Strategy Discovery Service]]
- `StrategyExplorerAgent` (Brave search candidate fetch)

## See also

- [[_index]]
- [[Content Reader]] (sibling for richer file-upload flows)
