---
tags: [frontend, routes]
---

# News Route

> `/news` — aggregated crypto-news feed with sentiment badges and source filters.

## Source

- `frontend/src/routes/news.tsx`

## How it works

`requireAuth()` guard. Pulls `NewsArticle` documents from `/api/v1/news` with
filter parameters for source, asset, and timeframe. Each card shows the
`SentimentBadge` (positive / negative / neutral) computed by the
`NewsSummarizer` service and a chip indicating whether the article was used
to seed a strategy auto-discovery run.

## Depends on

- [[React Query Options]]

## See also

- [[_index]]
- [[Knowledge Route]]
