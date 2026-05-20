---
tags: [backend, agent, tools, rag]
---

# Knowledge Tools

> RAG query helpers that ask the [[Hybrid Retriever]] for strategies, trade lessons, and discovered patterns — returning LLM-friendly dicts with relevance scores.

## Source

- `backend/app/agent/tools/knowledge_tools.py`

## How it works

Three thin async wrappers around `get_retriever()`:

- `search_strategies(query, limit)` — calls `retriever.search_strategies()`, returns `[{id, name, description, entry_rules, exit_rules, risk_params, win_rate, avg_return, market_conditions, timeframes, relevance_score}]`.
- `search_lessons(query, symbol, limit)` — symbol-filtered lesson retrieval with outcome, profit_pct, mistakes/successes/recommendations.
- `search_patterns(query, pattern_type, min_success_rate, limit)` — discovered patterns with success_rate, avg_return, sample_count.

Each unpacks the retriever's `list[tuple[Document, float]]` and rounds the score to 3 decimals. This is the contract `TradingAgent`'s decision framework relies on: the agent system prompt makes calling these mandatory before any trade recommendation.

## Depends on

- [[RAG Retrieval Pipeline]] — `app.knowledge.retriever.get_retriever`
- `StrategyKnowledge`, `LessonKnowledge`, `PatternKnowledge` document models

## Used by

- [[TradingAgent]] (mandatory historical-context step)
- [[TechnicalAnalyst]] — RAG enrichment for patterns + lessons
- [[MCP Tools]] (`mcp_search_strategies`, `mcp_search_lessons`, `mcp_search_patterns`)

## See also

- [[_index]]
- [[Hybrid Retriever]]
