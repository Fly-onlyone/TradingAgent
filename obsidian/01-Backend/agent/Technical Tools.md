---
tags: [backend, agent, tools]
---

# Technical Tools

> Indicator and chart-pattern computation over OKX candle data using the `ta` library + pandas.

## Source

- `backend/app/agent/tools/technical_tools.py`

## How it works

`get_technical_indicators(symbol, timeframe)` pulls 200 candles via [[Market Tools]], loads them into a pandas DataFrame, and computes SMA(20/50), EMA(12/26), RSI(14) + overbought/oversold tags, MACD line/signal/histogram, Stochastic K/D, Bollinger Bands (and position 0–1), ATR(14), and classic floor-trader pivot points (R2/R1/Pivot/S1/S2). A heuristic `trend` field (bullish/bearish/sideways) is derived from SMA crossover relationships.

`detect_chart_patterns(symbol, timeframe)` scans OHLC for head & shoulders, triangles, and similar shapes — returning a list of `{pattern, type, confidence, description}`.

`get_price_action(symbol, timeframe)` reports volatility %, direction, last close, and candlestick patterns (doji, engulfing, etc.) for the most recent N candles.

## Depends on

- [[Market Tools]] — `get_candlesticks`
- `ta`, `pandas`, `numpy`

## Used by

- [[TechnicalAnalyst]]
- [[RiskManager]] — reads RSI, BB position, ATR, and trend
- [[MCP Tools]] (`mcp_get_technical_indicators`, `mcp_detect_chart_patterns`)

## See also

- [[_index]]
