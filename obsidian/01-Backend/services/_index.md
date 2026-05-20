---
tags: [backend, services, moc]
---

# Services (MOC)

> Map of `backend/app/services/` — orchestration, AI extraction, notifications, and integrations that sit between routers and persistence.

## Source

- `backend/app/services/`

## How it works

Services are the application layer between FastAPI routers ([[Auth Endpoints]] and friends) and Beanie models. They orchestrate multi-step workflows that don't belong on a Document, wrap third-party SDKs (Anthropic, Apprise, OKX, winotify), and provide the [[AI Service Auth]] dual-mode pattern used by every Claude call. Background jobs in [[Background Service Startup]] and scheduled cycles in [[Task Scheduler]] / [[News Scheduler]] invoke these services as well.

## Children

### Discovery + AI extraction
- [[Strategy Discovery Service]] — orchestrates Explorer + Extractor subagent fan-out
- [[StrategyExtractor]] — Claude-based two-step extract
- [[Strategy Dedup]] — name + rules-fingerprint merge
- [[Strategy Rating Calculator]] — 40/30/20/10 weighted rating
- [[Source Discovery]] — Brave Search → NewsSource bootstrap
- [[Pattern Miner]] — rule-based TA pattern detection
- [[Trade Learner]] — closed-order lesson extraction
- [[Task Merger]] — AI-merge duplicate `AgentTask`s

### Execution + accounting
- [[Agent Execution Service]] — confirms `AgentDecision` → executes trade
- [[PnL Calculator]] — trade aggregation, summary, CSV/JSON export

### Notifications + IO
- [[Notification Service]] — in-app + Web Push + desktop toast
- [[Desktop Toast Pipeline]] — winotify + AUMID
- [[Email Service]] — Apprise multi-channel transport
- [[Article Fetcher]] — httpx + trafilatura
- [[Content Reader]] — URL/PDF/JSON/YAML file ingest
- [[Installed Apps Scanner]] — Windows registry + Steam

## See also

- [[Strategy Auto-Discovery Cycle]]
- [[Trading Decision Flow]]
- [[Chat-Session Lifecycle]]
