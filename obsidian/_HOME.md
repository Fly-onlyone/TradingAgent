---
tags: [moc, home]
---

# Trading Agent — Knowledge Vault

A graph-linked tour of the Trading Agent codebase. **Start with the architecture flows**
to build mental scaffolding, then drill into modules or patterns as needed.

> **Trading Agent** is a full-stack AI-powered crypto trading platform. FastAPI backend
> (agent + RAG + OKX integration), React + Tauri frontend, MongoDB persistence, scheduled
> news/strategy pipelines. ~320 source files across Python + TypeScript + Rust.

## 🧭 Start here — Architecture flows

These flow diagrams describe how the system behaves end-to-end. Every module
references one or more of these.

- [[Trading Decision Flow]] — User request → TradingAgent → subagents → OrderExecutor → OKX
- [[RAG Retrieval Pipeline]] — Hybrid (vector + text) → RRF → time decay → rerank
- [[Knowledge Graph Edges]] — APPLIES_TO, DETECTED_IN, MENTIONS, LEARNED_FROM…
- [[JWT Auth Flow]] — login, refresh, `iat`-based invalidation on password change
- [[WebSocket Connection Manager]] — channel topology and `_agent_channel_user_id`
- [[Background Service Startup]] — order in which services boot in `main.py`
- [[Request Logging Pipeline]] — async middleware → MongoDB → Sentry
- [[Chat-Session Checklist]] — 10-leg rule for new chat-session features
- [[Strategy Auto-Discovery Cycle]] — scheduled crawl → AI extraction → dedup → `StrategyKnowledge`
- [[Subagent Delegation Pattern]] — parent session captures tool-call bubbles

→ [[00-Architecture/_index|All architecture concepts]]

## 🐍 Backend

FastAPI + Beanie + Motor on Python 3.11+, managed by `uv`.

- [[01-Backend/agent/_index|agent/]] — TradingAgent, subagents, tools, scheduler
- [[01-Backend/api/_index|api/]] — REST endpoints + WebSocket channels
- [[01-Backend/db/_index|db/]] — Beanie models + Motor session
- [[01-Backend/knowledge/_index|knowledge/]] — RAG pipeline (embeddings → retrieval → rerank)
- [[01-Backend/exchange/_index|exchange/]] — OKX REST + WebSocket
- [[01-Backend/news/_index|news/]] — RSS crawler + summarizer + scheduler
- [[01-Backend/services/_index|services/]] — strategy discovery, trade learner, notifications
- [[01-Backend/security/_index|security/]] — Fernet encryption, key providers
- [[01-Backend/middleware/_index|middleware/]] — async request logger
- [[01-Backend/core/_index|core/]] — rate limit, settings, logging config

## ⚛️ Frontend

React 19 + Vite + TanStack (Router/Query) + Zustand + MUI 6, wrapped by Tauri v2.

- [[02-Frontend/components/_index|components/]] — domain-grouped React components
- [[02-Frontend/routes/_index|routes/]] — TanStack file-based routes
- [[02-Frontend/api/_index|api/]] — HTTP client + queryOptions
- [[02-Frontend/websocket/_index|websocket/]] — `useWebSocket`, `useAgentSocket`
- [[02-Frontend/store/_index|store/]] — Zustand stores
- [[02-Frontend/hooks/_index|hooks/]] — custom React hooks
- [[02-Frontend/theme/_index|theme/]] — MUI theme + zoom-aware overrides
- [[02-Frontend/utils/_index|utils/]] — validators, transformers, env detection
- [[02-Frontend/animations/_index|animations/]] — Framer Motion variants + spring configs
- [[02-Frontend/tauri/_index|tauri/]] — Rust shell, IPC, sidecar binary

## 🔌 External Integrations

External systems and libraries the codebase depends on.

→ [[03-Integrations/_index|All integrations]] — MongoDB, OKX, Anthropic, Sentry, Tauri, Local RAG, FlashRank, APScheduler, winotify, Release Please, etc.

## 🧩 Patterns

Codebase conventions to follow when adding features. **Read these before touching
the relevant subsystem.**

→ [[04-Patterns/_index|All patterns]] — CSS zoom handling, Framer Motion variants, AI service auth, Windows toasts, chat-session checklist.

## 🛠️ Operations

How to build, run, debug, and release.

→ [[05-Operations/_index|All operations]] — build commands, dev server, Release Please, Sentry setup, MongoDB MCP queries, lint/format rules.

## 📖 Glossary

Domain terms used throughout the vault.

→ [[06-Glossary/_index|Glossary]] — RAG, RRF, MoC, AUMID, Beanie, Motor, Fernet, ProactorEventLoop, etc.

## 🎯 Reading paths

**New contributor:** [[Trading Decision Flow]] → [[01-Backend/agent/_index|Backend agent module]] → [[Subagent Delegation Pattern]] → [[Anthropic API]]

**Frontend developer:** [[CSS Zoom Handling]] → [[ZoomAwareSelect Pattern]] → [[Framer Motion Variants]] → [[02-Frontend/components/_index|components]]

**DevOps / SRE:** [[Background Service Startup]] → [[Sentry Setup]] → [[MongoDB MCP Queries]] → [[Release Please Workflow]]

**Adding a chat-session feature:** [[Chat-Session Checklist]] → [[persist_session_message Pattern]] → [[Subagent Delegation Pattern]] → [[Notification Service]]
