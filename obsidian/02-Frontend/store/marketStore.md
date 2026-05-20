---
tags: [frontend, store, market]
---

# marketStore

> Live market data cache: tickers, order books, recent trades, candles by `${symbol}-${timeframe}`, indicators, plus user watchlist.

## Source

- `frontend/src/store/marketStore.ts`

## How it works

Pushed to from the [[Market WS Channel]]: `updateTicker`, `updateOrderBook`, `addTrade` (clamped at 100/symbol), `addCandle` (clamped at 500 keyed by `${symbol}-${timeframe}` — merges if last candle has same `timestamp`, otherwise appends). `selectedSymbol`/`selectedTimeframe` drive the chart. Wrapped with `persist` but `partialize` only stores `watchlist`. Defaults: `BTC-USDT`, `1h`, watchlist `[BTC, ETH, SOL]-USDT`.

## Used by

- Market page, chart, ticker widgets

## See also

- [[_index]]
- [[Market WS Channel]]
