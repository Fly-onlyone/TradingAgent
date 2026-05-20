---
tags: [moc, backend]
---

# 01-Backend — Map of Content

FastAPI + Beanie (MongoDB) on Python 3.11+, managed by `uv`. Modules organized by
responsibility; each subfolder is its own MOC.

## Modules

- [[01-Backend/agent/_index|agent/]] — TradingAgent, subagents (TechnicalAnalyst, NewsAnalyst, FundamentalAnalyst, RiskManager, OrderExecutor), tools, scheduler, session recorder
- [[01-Backend/api/_index|api/]] — REST endpoints + WebSocket channels (router registration order matters)
- [[01-Backend/db/_index|db/]] — Beanie `Document` models + Motor session + `document_models` registration
- [[01-Backend/knowledge/_index|knowledge/]] — RAG pipeline (embeddings → hybrid retrieval → RRF → time decay → optional rerank)
- [[01-Backend/exchange/_index|exchange/]] — OKX REST client + WebSocket market feed
- [[01-Backend/news/_index|news/]] — RSS crawler, credibility scorer, deduplicator, summarizer, scheduler
- [[01-Backend/services/_index|services/]] — Strategy discovery / extraction / dedup / rating, PnL, pattern miner, notifications, desktop toast pipeline, trade learner
- [[01-Backend/security/_index|security/]] — Fernet encryption, keyring store, key provider, secret resolver
- [[01-Backend/middleware/_index|middleware/]] — Async request logger
- [[01-Backend/core/_index|core/]] — Rate limiting, App settings, Sentry logging integration, Windows event loop policy

## Cross-references

- Architecture flows: [[00-Architecture/_index]]
- External integrations the backend uses: [[03-Integrations/_index]]
- Backend patterns to follow: [[04-Patterns/_index]]
- Build / dev / debug operations: [[05-Operations/_index]]

## See also

- [[_HOME]]
- [[Background Service Startup]] — what runs at boot, in what order
