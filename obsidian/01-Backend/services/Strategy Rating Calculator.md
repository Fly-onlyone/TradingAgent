---
tags: [backend, services, strategy-discovery]
---

# Strategy Rating Calculator

> Computes a 0-100 overall rating and 0-1 confidence for a `StrategyKnowledge` from four weighted signals.

## Source

- `backend/app/services/strategy_rating_calculator.py`

## How it works

`calculate_overall_rating()` blends four components into a single score, redistributing weights proportionally when signals are missing:

- 40% — performance metrics (win_rate, Sharpe scaled, drawdown inverted, avg_return centered at 50)
- 30% — average user `StrategyRating` rescaled from 1-5 stars to 0-100
- 20% — extraction-completeness (rule key count capped at 10 → 100)
- 10% — recency buckets (<7d=100, <30d=85, <90d=70, else 50)

Confidence = `data_points / 4` (clamped 0-1). When zero components are available the method returns `(50.0, 0.0)` so the UI always has a sensible default. Invoked once when [[Strategy Discovery Service]] saves a new strategy, and on demand from [[Strategy Ratings Endpoints]].

## Depends on

- [[StrategyKnowledge Model]]
- `StrategyRating` model

## Used by

- [[Strategy Discovery Service]]
- [[Strategy Ratings Endpoints]]

## See also

- [[_index]]
