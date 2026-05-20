---
tags: [integrations]
---

# feedparser

> RSS / Atom feed parser used by the news crawler.

## Used for

- Parsing RSS feeds from configured `news_sources`
- Extracting article titles, links, and publication timestamps before handing off to [[trafilatura]] for full-text extraction

## Configuration

- `feedparser>=6.0.0`
- News sources stored in `news_sources` collection
- Scheduled by [[APScheduler]] via `backend/app/agent/task_scheduler.py`

## Gotchas

- Some feeds return malformed XML — parser tolerates it but logs warnings
- Failed feeds are flagged in the daily monitoring report

## See also

- [[_index]]
- [[trafilatura]]
- [[APScheduler]]
