---
tags: [backend, agent, subagent]
---

# TechnicalAnalyst

> Subagent that turns indicators, chart patterns, and price action — plus historical patterns/lessons from the knowledge base — into a BUY/SELL/HOLD signal.

## Source

- `backend/app/agent/subagents/technical_analyst.py`

## How it works

The analyst gathers indicators ([[Technical Tools]]), chart patterns, and price action for a symbol/timeframe, then enriches the prompt with two RAG sections from [[Knowledge Tools]]: prior patterns for the asset and past trade lessons. It also pulls a few analyst-commentary snippets from [[Web Search Tools]].

It packs the data into a single context message, queries its [[ClaudeSDKClient]] inside `claude_sdk_workload_slot`, collects the response via [[ClaudeSDKClient Wrapper]], and extracts a `STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL` signal via keyword scan.

The system prompt explicitly requires the model to weight prior patterns/lessons when present, or state "no prior knowledge found" — matching the [[RAG Retrieval Pipeline]] philosophy.

## Depends on

- [[ClaudeSDKClient Wrapper]]
- [[Technical Tools]] — `get_technical_indicators`, `detect_chart_patterns`, `get_price_action`
- [[Knowledge Tools]] — `search_patterns`, `search_lessons`
- [[Web Search Tools]]

## Used by

- [[TradingAgent]] (via direct subagent invocation in higher-level workflows)

## See also

- [[_index]]
- [[Subagent Delegation Pattern]]
- [[RAG Retrieval Pipeline]]
