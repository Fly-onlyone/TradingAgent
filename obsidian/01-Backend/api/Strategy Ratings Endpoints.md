---
tags: [backend, api, strategies]
---

# Strategy Ratings Endpoints

> 1-5 star user ratings for [[StrategyKnowledge Model]] under `/strategies/ratings`.

## Source

- `backend/app/api/v1/strategy_ratings.py`

## How it works

`POST /{knowledge_id}/rate` is an upsert — looks up the existing `StrategyRating` by `(user_id, strategy_knowledge_id)` and updates or inserts. After write it triggers [[Strategy Rating Calculator]] to recompute the strategy's `overall_rating` + `rating_confidence`. `GET /{knowledge_id}/ratings` returns aggregate stats. `/top-rated` returns the highest-rated knowledge entries sorted by `overall_rating * rating_confidence`.

## Endpoints

- `POST /strategies/ratings/{knowledge_id}/rate` — upsert a user's rating
- `GET /strategies/ratings/{knowledge_id}/ratings` — average + counts + overall
- `GET /strategies/ratings/top-rated` — top-N list

## Depends on

- [[StrategyKnowledge Model]]
- `StrategyRating` model
- [[Strategy Rating Calculator]]

## See also

- [[_index]]
- [[Router Registration Order]]
