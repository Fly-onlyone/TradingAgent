---
tags: [backend, agent, tools]
---

# Agent Tools Overview

> Package layout for the agent's tool surface — pure async Python functions in `tools/`, with `@tool`-decorated MCP wrappers living one level up in `mcp_tools.py`.

## Source

- `backend/app/agent/tools/__init__.py` — empty marker, exports nothing
- Sibling modules: `trading_tools.py`, `market_tools.py`, `technical_tools.py`, `fundamental_tools.py`, `news_tools.py`, `knowledge_tools.py`, `memory_tools.py`, `web_search_tools.py`, `browser_tools.py`

## How it works

The `tools/` package is intentionally thin — each module exposes plain `async def` helpers ([[Market Tools]], [[Trading Tools]], etc.). These callables are reused by:

1. The Claude SDK via [[MCP Tools]] (`@tool` wrappers that JSON-encode results into an MCP envelope and buffer timing for the chat UI)
2. Subagents directly — they often call the underlying function without going through MCP (see [[TechnicalAnalyst]], [[FundamentalAnalyst]]).

Splitting the layer keeps the LLM-facing schemas and result-summary logic (`_summarize_result`, `_buffer_tool_result`) in `mcp_tools.py` while the actual data fetch stays portable.

## Depends on

- Underlying domain code: [[OKX REST Client]], [[RAG Retrieval Pipeline]], `NewsArticle`, `AgentMemory`, Brave Search API, trafilatura.

## Used by

- [[TradingAgent]] via [[MCP Tools]]
- Every subagent for direct calls

## See also

- [[_index]]
- [[MCP Tools]]
