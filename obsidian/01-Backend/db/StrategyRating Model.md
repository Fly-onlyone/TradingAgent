---
tags: [backend, db, model]
---

# StrategyRating Model

> User rating and qualitative feedback on a `StrategyKnowledge` entry — one rating per (user, strategy) pair.

## Source

- `backend/app/db/models/strategy_rating.py`
- Collection: `strategy_ratings`

## Key fields

- `user_id`, `strategy_knowledge_id`
- `rating` (1.0–5.0), `helpfulness` (1.0–5.0 optional)
- `notes`, `experience_level` (default `"intermediate"`), `tags`

## Used by

- Ratings rollup into `StrategyKnowledge.overall_rating` / `rating_confidence`
- Admin moderation views

## Special features

- Unique compound index `(strategy_knowledge_id, user_id)` enforces one-rating-per-user
- Secondary index sorts by `rating DESC` per strategy

## See also

- [[_index]]
- [[StrategyKnowledge Model]]
