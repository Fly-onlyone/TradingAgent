---
tags: [backend, agent, tools]
---

# Browser Tools

> Full-page fetch and proactive strategy extraction — gives the agent a way to drill from a search snippet into the article body and save tradeable strategies straight into the knowledge base.

## Source

- `backend/app/agent/tools/browser_tools.py`

## How it works

`browse_url(url, max_chars)` hits the URL through `httpx` with a 30-second timeout and a desktop User-Agent, then runs `trafilatura.bare_extraction()` to strip nav/comments and return `{title, text, url}`. Empty extractions raise `ValueError`.

`extract_strategy_from_url(url)` calls `browse_url`, hands the cleaned body to `StrategyExtractor` (the dual-mode Claude service — see [[AI Service Auth]]), then persists both a `StrategyKnowledge` row (with embedding via `StrategyEmbeddingGenerator`) and — when the caller is a real user — a shadow `Strategy` document so the Strategies UI picks it up (see [[Chat-Session Checklist]]).

The MCP wrappers in [[MCP Tools]] expose these as `browse_url` and `extract_strategy_from_url`; the agent's system prompt encourages it to call them when a search result looks strategy-like.

## Depends on

- `trafilatura`, `httpx`
- `app.services.strategy_extractor.StrategyExtractor` — [[AI Service Auth]]
- `StrategyKnowledge`, `StrategyEmbeddingGenerator`

## Used by

- [[TradingAgent]] — proactive web exploration step
- [[MCP Tools]]

## See also

- [[_index]]
- [[StrategyExplorer]]
