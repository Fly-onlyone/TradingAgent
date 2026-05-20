---
tags: [moc, architecture]
---

# Architecture — Map of Content

System-wide flows and patterns. **Read these first** to build a mental model before
diving into individual modules.

## Core flows

- [[Trading Decision Flow]] — End-to-end: user request → TradingAgent → subagents → OrderExecutor → OKX
- [[RAG Retrieval Pipeline]] — Hybrid (vector + text) → RRF fusion → time decay → optional rerank
- [[Knowledge Graph Edges]] — Entity relationship types: APPLIES_TO, DETECTED_IN, MENTIONS, LEARNED_FROM
- [[JWT Auth Flow]] — Login, refresh, `iat`-based invalidation on password change
- [[WebSocket Connection Manager]] — Channel topology, user channels, broadcast helpers
- [[Background Service Startup]] — Order of service boot in `lifespan()` of `main.py`
- [[Request Logging Pipeline]] — Async middleware → in-memory queue → MongoDB → Sentry
- [[Strategy Auto-Discovery Cycle]] — Scheduled crawl → AI extraction → dedup → `StrategyKnowledge`
- [[Subagent Delegation Pattern]] — How the parent session captures tool-call bubbles
- [[Chat-Session Lifecycle]] — created → running → completed / failed, with orphan cleanup

## See also

- [[_HOME]]
- CLAUDE.md cheatsheet
