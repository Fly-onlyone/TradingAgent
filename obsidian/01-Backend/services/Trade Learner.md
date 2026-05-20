---
tags: [backend, services, ai, learning]
---

# Trade Learner

> AI-powered post-trade analyst — turns a closed [[Order Model]] into a structured `TradeLesson`.

## Source

- `backend/app/services/trade_learner.py`

## How it works

Dual-mode via [[AI Service Auth]]. `TradeLearner.create()` picks API key or `ClaudeSDKClient`. `extract_lesson(order)` first checks for an existing `TradeLesson` (idempotent) then formats the order into a plain-text summary (entry/exit prices, P&L, stop-loss/take-profit presence, duration, `agent_reasoning` snippet) and asks Claude to call the `save_lesson` tool with `lesson_summary`, `market_context`, `mistakes`, `successes`, `recommendations`. Outcome (`PROFIT`/`LOSS`/`BREAKEVEN`) is computed locally from `realized_pnl_percent`. On AI failure `_rule_based_fallback()` builds a synthetic lesson noting missing stop-losses and large losses so the user still gets feedback. Inserted as [[TradeLesson Model]] + embedding via `TradeLessonEmbeddingGenerator`.

Invoked fire-and-forget by `pnl_calculator.close_trade()`.

## Depends on

- [[Anthropic API]]
- [[AI Service Auth]]
- [[Order Model]]
- [[TradeLesson Model]]

## Used by

- [[PnL Calculator]] (background `_extract_trade_lesson` task)

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
