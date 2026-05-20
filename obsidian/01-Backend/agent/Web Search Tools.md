---
tags: [backend, agent, tools]
---

# Web Search Tools

> Brave Search API wrappers with a 5-minute in-process TTL cache — both an MCP-exposed `search_web`/`search_news` for the agent and a direct call surface for subagent enrichment.

## Source

- `backend/app/agent/tools/web_search_tools.py`

## How it works

`search_web(query, count, freshness)` and `search_news(query, count, freshness)` POST to `https://api.search.brave.com/res/v1/web/search` and `.../news/search` respectively. The API key is resolved from [[App Settings]] (encrypted via [[Fernet Encryption]]) with an env-var fallback.

Results are normalized into `{results: [{title, url, description, age, ...}]}` (web) or `{articles: [{title, url, source, age, description, breaking}]}` (news). A flat `{cache_key: (timestamp, result)}` map TTLs at `_CACHE_TTL = 300` and is capped at `_CACHE_MAX_SIZE = 100` entries.

`freshness` is the Brave parameter: `pd` (past day), `pw` (past week), `pm` (past month), `py` (past year).

## Depends on

- Brave Search API (key in [[App Settings]] / env)
- `httpx`

## Used by

- [[TechnicalAnalyst]] — analyst commentary
- [[FundamentalAnalyst]] — regulatory/partnership scan
- [[NewsAnalyst]] — real-time breaking news
- [[StrategyExplorer]] — via [[Explorer Tools]]
- [[MCP Tools]] (`mcp_search_web`, `mcp_search_news`)

## See also

- [[_index]]
