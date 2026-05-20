---
tags: [integrations]
---

# trafilatura

> Article content extractor — pulls the main body of a news article from HTML, stripping ads and chrome.

## Used for

- Extracting article text for RSS entries discovered by [[feedparser]]
- Feeding clean content into news summarization and embedding pipelines

## Configuration

- `trafilatura>=1.6.0`
- Paired with `beautifulsoup4` for fallback parsing

## Gotchas

- Some sites block scraping or use heavy JS rendering — extractor falls back to RSS summary in those cases

## See also

- [[_index]]
- [[feedparser]]
