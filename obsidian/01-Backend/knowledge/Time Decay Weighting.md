---
tags: [backend, knowledge]
---

# Time Decay Weighting

> Exponential per-collection freshness weight applied inside vector scoring —
> news ages out fast, strategies barely at all.

## Source

- `backend/app/knowledge/retriever.py` (`_TIME_DECAY_PARAMS`, applied in `_vectorized_search`)

## How it works

A `(decay_rate, alpha)` tuple per collection drives the formula
`weighted = raw_score * (alpha + (1 - alpha) * exp(-decay_rate * age_hours))`.
`alpha` is a floor (the minimum multiplier a very old doc receives); `decay_rate`
is calibrated as `ln(2) / half_life_hours`:

| Collection           | Half-life | Alpha (floor) |
|----------------------|-----------|---------------|
| `news_articles`      | 24 h      | 0.30          |
| `trade_lessons`      | 7 days    | 0.50          |
| `strategy_knowledge` | 30 days   | 0.70          |
| `trading_patterns`   | 30 days   | 0.70          |

Age is computed against `created_at` (or `published_at` for news) in UTC, in hours.
Collections not in the map skip decay entirely.

## Depends on

- `_id`, `embedding`, and `created_at`/`published_at` projected by [[Vector Search]].

## Used by

- [[Vector Search]] (inline scoring step before threshold filtering)

## See also

- [[_index]]
- [[Hybrid Retriever]]
- [[RAG Retrieval Pipeline]]
