# Trading Agent

AI-powered cryptocurrency trading platform with automated task scheduling, multi-agent analysis, and real-time
monitoring.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Getting Started](#getting-started)
- [Development](#development)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Agent Chat](#agent-chat)
  - [Agent Tools](#agent-tools)
- [Knowledge Base (RAG)](#knowledge-base-rag)
  - [Knowledge Types](#knowledge-types)
  - [Auto-Generated Knowledge](#auto-generated-knowledge)
  - [Agent Integration](#agent-integration)
- [Automation Flow](#automation-flow)
  - [Task Types](#task-types)
  - [Lifecycle](#lifecycle)
  - [Subagents](#subagents)
  - [Risk & Safeguards](#risk--safeguards)
- [API Overview](#api-overview)

## Features

- **AI Trading Agent** — Chat with Claude AI via WebSocket, get structured trade recommendations with confidence scores
- **Multi-Agent Analysis** — Parallel subagents for technical, fundamental, and news sentiment analysis
- **Scheduled Tasks** — Cron-based automation with ASK (confirm before trading) and AUTO (immediate execution) modes
- **Real-Time Market Data** — Live tickers, watchlists, and technical indicator charts via OKX
- **Order Management** — Track open orders, order history, and active positions
- **Risk Controls** — Configurable risk levels (conservative/moderate/aggressive), position limits, stop-loss enforcement
- **Knowledge Base (RAG)** — Semantic search over trading strategies, lessons from past trades, and discovered patterns
- **News & Sentiment** — Aggregated market news with credibility-weighted sentiment scoring
- **Price Monitoring** — Condition-based alerts (price thresholds, RSI, volume spikes) with cooldowns
- **Desktop & Web** — Runs as a web app or native desktop app via Tauri v2

## Tech Stack

| Layer        | Technology                                                                      |
|--------------|---------------------------------------------------------------------------------|
| Frontend     | React 19, TypeScript 5.7, MUI 6, TanStack Router/Query, Zustand, Framer Motion |
| Backend      | Python 3.11+, FastAPI, Beanie (MongoDB ODM), APScheduler                        |
| AI           | Claude SDK (Anthropic), nomic-embed-text-v1.5 (local, ONNX)                    |
| Exchange     | OKX REST API                                                                    |
| Database     | MongoDB                                                                         |
| Desktop      | Tauri v2 (Rust)                                                                 |
| Package Mgmt | uv (Python), Bun (Node)                                                         |

## Prerequisites

- **Python** 3.11+ (< 3.13)
- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- **Bun** — JavaScript runtime & package manager ([install](https://bun.sh))
- **MongoDB** — Local instance or Atlas cluster

For the desktop app (optional):

- **Rust** — cargo available in PATH
- **Windows**: Visual Studio 2022 Build Tools with C++ workload (MSVC v143 + Windows SDK)

## Quick Start

```bash
# Install dependencies
uv sync
cd frontend && bun install && cd ..

# Copy environment files and fill in your values
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start both backend (port 7000) and frontend (port 3000)
uv run python run.py
```

Open http://localhost:3000 in your browser.

## Getting Started

1. **Register** at `/auth/register` with email and password
2. **Log in** at `/auth/login` — you'll receive a JWT token (auto-managed by the frontend)
3. **Set superuser** — the first user is _not_ automatically a superuser. Set `is_superuser: true` on your user document in MongoDB manually, or use the dev mode below
4. **Configure exchange** (superuser) — go to Settings and enter your OKX API credentials. Toggle sandbox mode for paper trading
5. **Configure agent** (superuser) — set the Anthropic API key and model in Settings, or use the `ANTHROPIC_API_KEY` env var

**Dev mode:** When `DEBUG=true`, the app uses a pre-authenticated superuser (`dev@localhost.dev`) with no login required.

**Superuser-only features:** OKX credentials, agent configuration, token expiry, embedding settings, admin logs, database explorer.

**Auth details:** JWT with HS256, configurable expiry (`ACCESS_TOKEN_EXPIRE_MINUTES`), transparent refresh on 401, and token revocation on password change (all tokens issued before the change are invalidated).

## Development

| Task             | Command                         |
|------------------|---------------------------------|
| Web dev          | `uv run python run.py`          |
| Desktop dev      | `cd frontend && bun run tauri:dev` |
| Build desktop    | `cd frontend && bun run tauri:build` |
| Test backend     | `uv run pytest`                 |
| Test frontend    | `cd frontend && bun run test`   |
| Lint backend     | `uv run ruff check`             |
| Lint frontend    | `cd frontend && bun run lint`   |
| Format backend   | `uv run ruff format`            |
| Format frontend  | `cd frontend && bun run format` |

> **Note:** Do not run `uv run python run.py` alongside `bun run tauri:dev` — the backend would start twice.

## Environment Variables

Both `.env.example` files document all available variables. The key ones:

### Backend (`backend/.env`)

| Variable                 | Required | Description                                      |
|--------------------------|----------|--------------------------------------------------|
| `SECRET_KEY`             | Prod     | JWT signing key (generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `MONGODB_URL`            | No       | Default: `mongodb://localhost:27017`              |
| `MONGODB_DB_NAME`        | No       | Default: `trading_agent`                          |
| `ANTHROPIC_API_KEY`      | No       | Falls back to Claude Code CLI credentials         |
| `OKX_API_KEY`            | No       | Prefer Settings UI; env var as fallback           |
| `OKX_SECRET_KEY`         | No       | Prefer Settings UI; env var as fallback           |
| `OKX_PASSPHRASE`         | No       | Prefer Settings UI; env var as fallback           |
| `OKX_SANDBOX`            | No       | Default: `true`                                   |
| `SECRETS_ENCRYPTION_KEYS`| No       | Fernet keys for encrypting secrets at rest        |
| `SENTRY_DSN`             | No       | Enables Sentry error tracking                     |

### Frontend (`frontend/.env`)

| Variable                 | Required | Description                                       |
|--------------------------|----------|---------------------------------------------------|
| `VITE_SENTRY_DSN`        | No       | Enables Sentry in the browser                     |
| `SENTRY_AUTH_TOKEN`      | No       | Uploads source maps during build                  |

See `backend/.env.example` and `frontend/.env.example` for the full list including Sentry tuning, logging, and external data API keys (Brave Search, CoinGecko, Glassnode).

## Architecture

```
Frontend (React 19 + MUI 6 + TanStack Router)
  ↕  REST / WebSocket
Backend (FastAPI + Beanie/MongoDB)
  ↕
Trading Agent (Claude SDK)
  ├── TechnicalAnalyst   — chart patterns, indicators (RSI, MACD, Bollinger)
  ├── FundamentalAnalyst  — on-chain metrics, tokenomics, macro
  ├── NewsAnalyst         — sentiment, credibility-weighted signals
  ├── RiskManager         — position sizing, drawdown limits
  └── OrderExecutor       — OKX exchange execution with idempotency
  ↕
External: OKX Exchange │ News APIs │ Local Embeddings (nomic) │ MongoDB
```

## Agent Chat

The primary interface is a real-time chat with Claude AI over WebSocket (`/agent` page).

**How it works:**

1. Frontend opens a WebSocket connection to the backend
2. Backend creates a `TradingAgent` instance with 20 MCP tools attached
3. User sends a message (e.g., "Analyze BTC-USDT") — the agent streams back thinking blocks, tool calls, and a final response
4. At the end of analysis, the agent calls `submit_recommendation` to produce a structured decision (action, confidence, entry/SL/TP, key factors)
5. Sessions are persisted in MongoDB — messages, tool calls, and thinking content are all saved and resumable

**Agent decision framework** (enforced via system prompt):

```
Historical Context → search knowledge base for past strategies, lessons, patterns
  → Data Gathering → fetch ticker, indicators, on-chain metrics, news
    → Technical Analysis → RSI, MACD, Bollinger, chart patterns
      → Fundamental Analysis → on-chain flows, macro indicators
        → Sentiment Analysis → news sentiment, web search
          → Risk Assessment → position sizing, stop-loss placement
            → submit_recommendation (structured output)
```

### Agent Tools

| Category           | Tools                                                          |
|--------------------|----------------------------------------------------------------|
| Market Data        | `get_ticker`, `get_orderbook`, `get_candlesticks`              |
| Technical Analysis | `get_technical_indicators`, `detect_chart_patterns`            |
| Fundamental        | `get_onchain_metrics`, `get_macro_indicators`                  |
| News & Sentiment   | `get_latest_news`, `get_news_sentiment`                        |
| Knowledge (RAG)    | `search_strategies`, `search_lessons`, `search_patterns`       |
| Trading            | `get_account_balance`, `get_open_orders`, `place_order`, `cancel_order` |
| Web Search         | `search_web`, `search_news`                                    |
| Output             | `submit_recommendation`, `modify_task`                         |

## Knowledge Base (RAG)

The agent augments its analysis with a local knowledge base using semantic search — no external embedding API required.

### Knowledge Types

| Type                | Source                           | Contains                                                     |
|---------------------|----------------------------------|--------------------------------------------------------------|
| **Strategy**        | User-created via UI/API          | Entry/exit rules, risk params, win rate, Sharpe ratio        |
| **Trade Lesson**    | Auto-extracted from filled orders | Outcome, P&L %, mistakes, successes, market context          |
| **Trading Pattern** | Discovered by PatternMiner       | Conditions, success rate, sample count, average return       |

### How It Works

- **Embedding model:** `nomic-ai/nomic-embed-text-v1.5` — 768 dimensions, runs locally on CPU via ONNX (~30-50ms per embedding, no API key needed)
- **Storage:** Vectors are stored inline on each MongoDB document
- **Search:** Query is embedded, then dot-product similarity is computed against stored vectors. Minimum threshold: 0.7 (0.6 for cross-type search)
- **Fallback:** If embedding fails, falls back to MongoDB `$text` search, then regex matching

### Auto-Generated Knowledge

- **Trade lessons:** When an order is filled, `TradeLearner` uses Claude Sonnet to extract a lesson — what went right, what went wrong, and recommendations. Falls back to rule-based analysis (checks for missing stop-loss, trading against trend, overbought/oversold entries) if the API call fails.
- **Trading patterns:** `PatternMiner` scans historical candles for RSI bullish divergence, volume spike breakouts, support bounces, and golden crosses. Patterns are validated against recent trade outcomes periodically.

### Agent Integration

The agent uses knowledge at two levels:

1. **Interactive chat** — The system prompt instructs the agent to call `search_strategies`, `search_lessons`, and `search_patterns` before every analysis
2. **Scheduled tasks** — The task scheduler automatically injects relevant knowledge context into the prompt before the agent runs

## Automation Flow

Users create scheduled tasks via the UI (`/tasks`) or API. Each task defines a **type**, **frequency**, **risk level**, and **agent mode**.

### Task Types

| Type           | Purpose                        | Output                                    |
|----------------|--------------------------------|-------------------------------------------|
| **Analysis**   | Market analysis only           | Agent decision (analysis report)          |
| **Trading**    | Analysis + potential execution | Recommendation → trade (if gates pass)    |
| **Monitoring** | Condition-based alerts         | Notification when threshold is breached   |

### Lifecycle

```
Task Created → APScheduler trigger (once / hourly / daily / weekly / cron)
  │
  ├─ Analysis: agent analyzes each symbol with MCP tools → stores decision
  │
  ├─ Trading: agent analyzes → gate checks (confidence ≥ threshold? daily limit?)
  │    ├─ AUTO mode → execute trade immediately via OKX
  │    └─ ASK mode  → send confirmation notification → user accepts/rejects → execute or discard
  │
  └─ Monitoring: evaluate conditions (price, RSI, volume) per symbol
       └─ condition triggered → alert notification (respects cooldown)
```

### Subagents

When enabled, three specialist agents run **in parallel** before the main analysis:

| Subagent           | Focus                                              |
|--------------------|----------------------------------------------------|
| TechnicalAnalyst   | Indicators, chart patterns, BUY/SELL/HOLD signal   |
| FundamentalAnalyst | On-chain metrics, tokenomics, valuation             |
| NewsAnalyst        | Sentiment score, top stories, directional signal    |

Their results are aggregated into an enriched prompt for the main agent, improving decision quality at the cost of additional API calls.

### Risk & Safeguards

| Level        | Max Risk / Trade | Min Confidence | Use Case             |
|--------------|------------------|----------------|----------------------|
| Conservative | 1.5%             | 75%            | Capital preservation |
| Moderate     | 3.0%             | 65%            | Balanced approach    |
| Aggressive   | 7.5%             | 55%            | Growth-oriented      |

Additional safeguards: max position size cap, daily trade limit per task, mandatory stop-loss recommendation, idempotent order execution (no duplicate trades on retry), auto-pause after consecutive failures.

## API Overview

The backend serves a REST API at `http://localhost:7000`. Interactive docs are available at `/docs` (Swagger) and `/redoc`.

| Prefix                | Description                    |
|-----------------------|--------------------------------|
| `/auth`               | Login, token refresh, password |
| `/api/v1/market`      | Tickers, indicators, candles   |
| `/api/v1/orders`      | Order history and positions    |
| `/api/v1/strategies`  | Strategy CRUD                  |
| `/api/v1/knowledge`   | Knowledge base (RAG) search    |
| `/api/v1/news`        | News feed and sentiment        |
| `/api/v1/agent/tasks` | Scheduled task management      |
| `/api/v1/agent/sessions` | Agent WebSocket sessions    |
| `/api/v1/agent/decisions` | Trading decision history   |
| `/api/v1/notifications` | Alerts and confirmations     |
| `/api/v1/settings`    | App configuration              |
| `/api/v1/admin`       | User management, logs (superuser) |
