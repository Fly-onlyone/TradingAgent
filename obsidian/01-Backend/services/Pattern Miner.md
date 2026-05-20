---
tags: [backend, services, pattern-mining]
---

# Pattern Miner

> Rule-based technical-analysis scanner — sweeps historical candles across active symbols/timeframes and emits `TradingPattern` rows.

## Source

- `backend/app/services/pattern_miner.py`

## How it works

`PatternMiner.run_mining_cycle()` resolves active symbols (recent filled orders, capped at 10, fallback `BTC/ETH/SOL-USDT`) and iterates `['1H', '4H', '1D']`. For each (symbol, timeframe) it pulls 200 candles via `get_candlesticks` then runs four pure detectors against the pandas frame:

- `_detect_rsi_divergence` — bullish divergence by halving the recent window and comparing first/second-half lows.
- `_detect_volume_breakout` — volume > 2x SMA-20 AND close above previous 20-bar high.
- `_detect_support_bounce` — low within ±1% of 20-bar low and close above it.
- `_detect_golden_cross` — SMA-50 crossing above SMA-200 in the last 5 bars.

New patterns are inserted as [[TradingPattern Model]] + embedding via `TradingPatternEmbeddingGenerator`. Existing patterns get their `success_rate` re-weighted 80/20 against recent closed-order win rate from `_validate_pattern()`.

## Depends on

- `app.agent.tools.market_tools.get_candlesticks`
- [[TradingPattern Model]]
- [[Order Model]]

## Used by

- [[Task Scheduler]] (mining cycle)

## See also

- [[_index]]
