---
tags: [operations]
---

# MongoDB MCP Queries

> Use MongoDB MCP tools (`find`, `aggregate`) for production debugging — start with the `logs` collection.

## What it does

When investigating production issues, query the production MongoDB (`trading_agent` DB) BEFORE reading code:

1. `logs` collection — ERROR/WARNING by `logger_name`, top error messages
2. `agent_sessions` — failed sessions (0 assistant messages), stuck sessions (`is_active=true` older than 2h)
3. `app_settings` — current config values (read with care, contains secrets)

## Setup

- MongoDB MCP server configured in user's `~/.claude/mcp.json`
- Database name: `trading_agent`

## Gotchas

- **NEVER** query `users` or `app_settings` contents in monitoring scripts — secrets and API keys
- **NEVER** read `agent_sessions.messages.content` — metadata only (counts, timestamps, status, title)
- Safe collections: `logs`, `agent_sessions` (metadata), `knowledge_chunks`, `knowledge_edges`, `news_articles`, `strategy_knowledge`, `trade_lessons`, `trading_patterns`, `news_sources`, `orders`, `trades`

## See also

- [[_index]]
- [[Production Debugging Checklist]]
- [[Monitoring Health Checks]]
