---
tags: [backend, db, model]
---

# CredibilityEvent Model

> Outcome record evaluating a news source's prediction accuracy — feeds the rolling `credibility_score` on `NewsSource`.

## Source

- `backend/app/db/models/news.py` — `CredibilityEvent`
- Collection: `credibility_events`

## Key fields

- `source_id` → [[NewsSource Model]], `article_id` → [[NewsArticle Model]]
- `prediction_type` (`price_movement` / `event`), `predicted_outcome`, `actual_outcome`
- `was_accurate: bool`, `confidence_score` (0..1)
- `symbol`, `timeframe_hours`
- `evaluated_at`

## Used by

- News credibility scorer service
- Reputation rollups on `NewsSource.credibility_score`

## Special features

- Compound index `(source_id, evaluated_at DESC)` for time-windowed accuracy rollups

## See also

- [[_index]]
- [[NewsSource Model]]
