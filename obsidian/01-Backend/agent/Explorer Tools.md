---
tags: [backend, agent, tools]
---

# Explorer Tools

> Discovery-scoped MCP toolset for [[StrategyExplorer]] — list configured sources, fetch articles, check dedup status, and hand off candidates.

## Source

- `backend/app/agent/explorer_tools.py`

## How it works

Four `@tool`-decorated MCP wrappers, registered into a dedicated `strategy_explorer` server alongside reused `mcp_search_web` / `mcp_search_news`:

- `list_configured_sources()` — returns `NewsSource` rows flagged `strategy_extraction=True` and `crawl_enabled=True`; the scout calls this once per cycle to seed known-good domains.
- `fetch_article(url, max_chars)` — trafilatura extraction with `_MAX_FETCH_CHARS = 60_000` and a 15-second timeout; only meant for promising hits.
- `has_been_extracted(urls)` — checks `StrategyKnowledge.source_url` so the scout doesn't waste turns re-discovering known strategies.
- `submit_candidates(candidates)` — pure sink; the orchestrator reads back the buffered tool result.

This server is intentionally separate from `ALL_TRADING_TOOLS` in [[MCP Tools]] so the main agent doesn't get a `fetch_article` tool that bypasses its crawler policies. `explorer_allowed_tool_names()` produces the prefixed allowlist (`mcp__strategy_explorer__*`).

## Depends on

- `NewsSource`, `StrategyKnowledge` models
- `trafilatura`, `httpx`
- [[MCP Tools]] — borrows `_buffer_tool_result`, `mcp_search_web`, `mcp_search_news`

## Used by

- [[StrategyExplorer]]

## See also

- [[_index]]
- [[Strategy Auto-Discovery Cycle]]
