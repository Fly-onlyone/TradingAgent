---
tags: [integrations]
---

# MongoDB

> Primary datastore for all backend state — sessions, logs, knowledge, orders, app settings.

## Used for

- Agent sessions and messages ([[Chat-Session Lifecycle]])
- Structured logs (`logs` collection — first stop for production debugging)
- RAG knowledge: `knowledge_chunks`, `knowledge_edges`, `strategy_knowledge`, `trade_lessons`, `trading_patterns`
- Orders, trades, news articles, app settings
- Accessed via [[Motor Async Driver]] and [[Beanie ODM]]

## Configuration

- Connection string in backend env / [[App Settings]]
- Database name: `trading_agent`
- Safe collections list documented in `docs/MONITORING.md`

## Gotchas

- Never read `users` or `app_settings` directly in monitoring queries — they contain secrets and API keys
- Never read `agent_sessions.messages.content` — metadata only

## See also

- [[_index]]
- [[Motor Async Driver]]
- [[Beanie ODM]]
- [[MongoDB MCP Queries]]
