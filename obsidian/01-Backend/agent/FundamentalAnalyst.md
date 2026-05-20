---
tags: [backend, agent, subagent]
---

# FundamentalAnalyst

> Subagent that scores valuation (`UNDERVALUED / FAIR / OVERVALUED`) from on-chain metrics, tokenomics, macro indicators, and recent regulatory/partnership news.

## Source

- `backend/app/agent/subagents/fundamental_analyst.py`

## How it works

The analyst pulls on-chain metrics, project fundamentals, and macro indicators from [[Fundamental Tools]] in parallel with a regulatory/governance web search from [[Web Search Tools]]. It formats market cap, supply, ATH, dev activity, TVL, BTC dominance, and Fear & Greed into a single context block.

A one-shot Claude call through its [[ClaudeSDKClient]] (serialized via [[ClaudeSDKClient Wrapper]]) returns a valuation thesis. The wrapper scans the response for keywords like "significantly undervalued" to derive a coarse `assessment` + `score` (0–100).

Like the other analysts, the model behind it has a focused system prompt — it does NOT create its own [[AgentSession Model]]; the parent's session captures any delegation context.

## Depends on

- [[ClaudeSDKClient Wrapper]]
- [[Fundamental Tools]] — CoinGecko-backed on-chain, project, and macro
- [[Web Search Tools]]

## Used by

- [[TradingAgent]]

## See also

- [[_index]]
- [[Subagent Delegation Pattern]]
