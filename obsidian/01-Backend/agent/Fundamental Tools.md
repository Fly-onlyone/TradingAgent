---
tags: [backend, agent, tools]
---

# Fundamental Tools

> On-chain, project, and macro indicators sourced primarily from the free CoinGecko API.

## Source

- `backend/app/agent/tools/fundamental_tools.py`

## How it works

- `get_onchain_metrics(symbol)` — normalizes the symbol (strips `-USDT`/`-USD`), hits CoinGecko for market cap, ranks, 24h/7d/30d performance, supply, ATH, GitHub commits/stars. The placeholder shape leaves room for richer sources (Glassnode, CryptoQuant) without API changes.
- `get_project_fundamentals(symbol)` — tokenomics (market cap, FDV), DeFi TVL/category, project categories.
- `get_macro_indicators()` — crypto-wide totals (total market cap, BTC dominance, ETH dominance) plus the Fear & Greed Index with a signal interpretation.

All HTTP calls use `httpx.AsyncClient` and fail soft — missing fields just don't appear in the response dict.

## Depends on

- CoinGecko HTTP API (no key required)
- `httpx`

## Used by

- [[FundamentalAnalyst]]
- [[MCP Tools]] (`mcp_get_onchain_metrics`, `mcp_get_macro_indicators`)

## See also

- [[_index]]
- [[FundamentalAnalyst]]
