---
tags: [moc, backend, agent]
---

# 01-Backend / agent — Map of Content

> The TradingAgent and its subagents — Claude SDK-driven trading orchestration with in-process MCP tools, RAG-aware analysis, and APScheduler-backed automation.

## Orchestrator

- [[TradingAgent]] — main agent loop, owns the user-facing `ClaudeSDKClient`
- [[ClaudeSDKClient Wrapper]] — shared SDK builder + workload semaphore
- [[OpenAIAgentRunner]] — OpenAI-side counterpart, selected when `agent_provider == OPENAI`

## Subagents

- [[TechnicalAnalyst]] — indicator, pattern, and price-action signals
- [[FundamentalAnalyst]] — on-chain, tokenomics, macro valuation
- [[NewsAnalyst]] — sentiment + narrative-continuity from articles
- [[RiskManager]] — position sizing, risk score, portfolio concentration
- [[OrderExecutor]] — risk-gated, idempotent order placement on OKX
- [[StrategyExtractor Agent]] — per-article strategy extraction (pure compute)
- [[StrategyExplorer]] — agentic scout for strategy-article candidates

## Tools

- [[Agent Tools Overview]] — the `tools/` package layout
- [[Trading Tools]] — balances, positions, orders
- [[Knowledge Tools]] — strategy/lesson/pattern RAG queries
- [[Memory Tools]] — cross-session agent memory
- [[Market Tools]] — ticker, orderbook, candlesticks
- [[News Tools]] — articles + sentiment from DB
- [[Technical Tools]] — indicators + chart patterns
- [[Fundamental Tools]] — on-chain + macro
- [[Web Search Tools]] — Brave Search wrappers
- [[Browser Tools]] — trafilatura page fetch + auto-extract
- [[Explorer Tools]] — Explorer-only MCP toolset
- [[MCP Tools]] — `@tool` MCP registration for all of the above

## Infrastructure

- [[Task Scheduler]] — APScheduler + per-task agent lifecycles
- [[Periodic Job]] — reusable interval-job descriptor
- [[Startup Reconciler]] — orphan-cycle and session cleanup
- [[Session Recorder]] — `persist_session_message` + WS broadcasts
- [[Memory Telemetry]] — process RSS checkpoints
- [[Agent Auth]] — Anthropic API key resolution

## See also

- [[_HOME]]
- [[Subagent Delegation Pattern]]
- [[Trading Decision Flow]]
- [[Chat-Session Checklist]]
