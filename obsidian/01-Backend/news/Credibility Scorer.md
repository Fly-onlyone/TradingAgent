---
tags: [backend, news]
---

# Credibility Scorer

> Scores each `NewsSource` 0.0-1.0 from a base by source type plus an accuracy
> adjustment and a reputation-age bonus.

## Source

- `backend/app/news/credibility.py` (`CredibilityScorer`)

## How it works

`calculate_score(source_id)` sums three components, then clamps to `[0, 1]`:

- **Base score** — by `source_type`: official 0.90, major_news 0.75, news 0.60,
  blog 0.40, social 0.30, unknown 0.20.
- **Accuracy adjustment** (`±0.15` cap) — looks at the last 90 days of
  `CredibilityEvent` rows for that source. Computes
  `(accuracy_rate - 0.5) * 0.3`, so 100 % correct → `+0.15`, 0 % → `-0.15`.
- **Reputation bonus** (`+0 .. +0.10`) — linearly grows with `days_tracked / 365`.

`evaluate_prediction(article_id, actual_outcome)` reads an article's
`predicted_impact`, compares predicted vs actual via bullish/bearish term
matching, writes a `CredibilityEvent`, marks the article verified, and
refreshes the source's score. `update_source_score` is also called by the
6-hour scheduler job in [[News Scheduler]]. `get_top_sources` returns
sources with a minimum number of evaluations, sorted by score.

## Depends on

- [[NewsSource Model]] · [[CredibilityEvent Model]] · [[NewsArticle Model]]

## Used by

- [[News Scheduler]] (`_update_credibility_scores` every 6h)
- Source-quality dashboards

## See also

- [[_index]]
