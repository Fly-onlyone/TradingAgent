---
tags: [backend, agent, subagent]
---

# NewsAnalyst

> Subagent that turns recent articles + sentiment into a directional bias, checking for repeat-narrative coverage against the RAG knowledge base.

## How it works

`analyze()` fetches recent articles and sentiment via [[News Tools]], pulls prior coverage for narrative-continuity checks (search_news against the RAG store), and adds real-time Brave news from [[Web Search Tools]]. Everything goes into a single context turn against its [[ClaudeSDKClient]].

The system prompt forces the model to flag whether the current story is a repeat (likely priced in) or genuinely new. After the response, `_extract_signal()` combines keyword cues ("strong buy", "very bearish") with the weighted-sentiment score to emit `STRONG_BUY..STRONG_SELL` / `NEUTRAL` / `SLIGHT_BULLISH` / `SLIGHT_BEARISH`.

`analyze_breaking_news()` is a focused variant for query-driven analysis. `get_market_sentiment_summary()` aggregates per-asset sentiment for BTC/ETH/SOL/XRP plus an overall mood.

## Source

- `backend/app/agent/subagents/news_analyst.py`

## Depends on

- [[ClaudeSDKClient Wrapper]]
- [[News Tools]] — DB-backed articles + sentiment
- [[Web Search Tools]] — real-time Brave news

## Used by

- [[TradingAgent]]

## See also

- [[_index]]
- [[Subagent Delegation Pattern]]
