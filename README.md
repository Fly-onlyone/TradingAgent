# Trading Agent

AI-powered cryptocurrency trading platform with automated task scheduling, multi-agent analysis, and real-time
monitoring.

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

## Development

- Web dev: run `uv run python run.py` from the repo root to start the backend and Vite together.
- Desktop dev: run `cd frontend && bun run tauri:dev` to start Vite via Tauri's `beforeDevCommand` and let the Tauri app
  spawn the backend.
- Do not run `uv run python run.py` alongside `bun run tauri:dev`, or the backend will be launched twice.

## Automatic Task Workflow

The task system lets users create scheduled trading operations that run autonomously. Tasks go through a complete
lifecycle: **creation → scheduling → execution → decision → (optional) trade**.

### Task Types

| Type           | Purpose                              | Output                                                   |
|----------------|--------------------------------------|----------------------------------------------------------|
| **Analysis**   | Market analysis only                 | `AgentDecision` (type=ANALYSIS)                          |
| **Trading**    | Analysis + potential trade execution | `AgentDecision` (type=RECOMMENDATION/TRADE_EXECUTION)    |
| **Monitoring** | Price/condition alerts               | `AgentDecision` (type=MONITORING_ALERT) + `Notification` |

### Task Creation

Users create tasks via the frontend (`/tasks`) or API (`POST /api/v1/agent/tasks`):

```json
{
  "name": "Daily BTC Analysis",
  "taskType": "trading",
  "frequency": "daily",
  "scheduledTime": "09:00",
  "symbols": [
    "BTC-USDT",
    "ETH-USDT"
  ],
  "riskLevel": "moderate",
  "agentMode": "ask",
  "useSubagents": false,
  "customInstructions": "Focus on support/resistance levels"
}
```

Key fields:

- **frequency**: `once`, `hourly`, `daily`, `weekly`, `custom` (cron)
- **riskLevel**: `conservative` (1.5% risk, 75% min confidence), `moderate` (3%, 65%), `aggressive` (7.5%, 55%)
- **agentMode**: `ask` (notification + user confirmation) or `auto` (immediate execution)
- **useSubagents**: When true, runs TechnicalAnalyst + FundamentalAnalyst + NewsAnalyst in parallel before the main
  agent analysis

### Scheduling (APScheduler)

`AgentTaskScheduler` in `task_scheduler.py` manages the execution loop:

1. On startup, loads all `ACTIVE` tasks from MongoDB
2. Creates APScheduler triggers per task (IntervalTrigger, CronTrigger, DateTrigger)
3. On each trigger fire, calls `_execute_task(task_id)`
4. One-time tasks auto-complete after execution

### Execution Flow

#### Analysis Tasks

```
_execute_analysis_task(task)
  └─ for each symbol:
       ├─ [if use_subagents] Run 3 subagents in parallel → build enriched prompt
       ├─ agent.analyze(prompt) → Claude processes with MCP tools
       │    ├─ get_ticker, get_technical_indicators, get_candlesticks
       │    ├─ get_onchain_metrics, get_macro_indicators
       │    ├─ get_latest_news, get_news_sentiment
       │    └─ submit_recommendation (structured output tool)
       ├─ Store AgentDecision (type=ANALYSIS)
       └─ record_execution(success=True)
```

#### Trading Tasks

```
_execute_trading_task(task)
  └─ for each symbol:
       ├─ [if use_subagents] Run 3 subagents in parallel → build enriched prompt
       ├─ agent.analyze(prompt) → structured recommendation
       ├─ Gate checks:
       │    ├─ confidence >= min_confidence for risk level?
       │    └─ daily trade count < max_daily_trades?
       ├─ Store AgentDecision (type=RECOMMENDATION)
       │
       ├─ [AUTO mode] → execute_trade_for_decision() immediately
       │    ├─ OrderExecutor.execute_trade() or execute_with_risk_params()
       │    ├─ Idempotency key: task-{task_id}-decision-{decision_id}
       │    └─ Create TRADE_EXECUTED notification
       │
       └─ [ASK mode] → Create TRADE_CONFIRMATION notification
            ├─ Decision status = PENDING, expires in 1 hour
            └─ User confirms → execute_trade_for_decision()
                 or rejects / expires → no trade
```

#### Monitoring Tasks

```
_execute_monitoring_task(task)
  └─ for each symbol:
       ├─ Check cooldown (skip if last_alert_at + cooldown > now)
       ├─ Fetch market data: get_ticker, get_technical_indicators
       ├─ Evaluate each MonitoringCondition:
       │    ├─ PRICE_ABOVE / PRICE_BELOW: compare ticker price vs threshold
       │    ├─ PRICE_CHANGE_PCT: compare 24h % change vs threshold
       │    ├─ RSI_ABOVE / RSI_BELOW: compare RSI(14) vs threshold
       │    ├─ VOLUME_SPIKE: compare current volume vs avg * multiplier
       │    └─ CUSTOM: call agent.analyze() with condition description
       ├─ If any condition triggers:
       │    ├─ Store AgentDecision (type=MONITORING_ALERT)
       │    ├─ Create PRICE_ALERT notification
       │    └─ Update task.last_alert_at (cooldown reset)
       └─ record_execution(success=True)
```

### Structured Tool Output (`submit_recommendation`)

Instead of regex-parsing free-form text, the agent calls a `submit_recommendation` MCP tool at the end of analysis,
providing structured data:

```python
{
    "action": "buy",  # buy | sell | hold | wait
    "confidence": 78.5,  # 0-100
    "entry_price": 98500.0,  # optional
    "stop_loss": 96200.0,  # optional
    "take_profit": 104000.0,  # optional
    "position_size": 0.05,  # optional
    "summary": "BTC showing strong breakout above key resistance...",
    "key_factors": ["RSI divergence", "Volume confirmation", "News catalyst"]
}
```

The existing regex extractors remain as a fallback if the tool is not called.

### Subagent Integration

When `use_subagents=true`, the scheduler runs three specialist agents **in parallel** before the main analysis:

| Subagent           | Input                  | Output                                       |
|--------------------|------------------------|----------------------------------------------|
| TechnicalAnalyst   | symbol + timeframe     | Indicators, patterns, signal (BUY/SELL/HOLD) |
| FundamentalAnalyst | base asset (e.g., BTC) | On-chain metrics, valuation assessment       |
| NewsAnalyst        | asset list             | Sentiment score, top news, signal            |

Results are aggregated into an enriched prompt that gives the main agent pre-digested specialist context, improving
decision quality at the cost of additional API calls.

### Robustness

- **Retry with backoff**: Transient errors (ConnectionError, TimeoutError) trigger up to `max_retries` retries with
  exponential backoff (5s, 10s, 20s)
- **Auto-pause**: After `max_consecutive_failures` (default 3) consecutive failures, the task is automatically paused
  and a `TASK_FAILED` notification is created
- **Idempotency**: Each trade uses a unique idempotency key to prevent duplicate orders on retry
- **Cooldown**: Monitoring tasks respect `alert_cooldown_minutes` to avoid notification spam

### ASK vs AUTO Mode

| Aspect          | ASK Mode                                | AUTO Mode                       |
|-----------------|-----------------------------------------|---------------------------------|
| Trade execution | Requires user confirmation              | Immediate                       |
| Notification    | `TRADE_CONFIRMATION` with accept/reject | `TRADE_EXECUTED` after the fact |
| Expiration      | Decision expires after 1 hour           | N/A                             |
| Use case        | Higher-risk, learning phase             | Trusted strategies, low-risk    |

### Risk Management

Risk levels control position sizing and minimum confidence thresholds:

| Level        | Max Risk/Trade | Min Confidence | Use Case             |
|--------------|----------------|----------------|----------------------|
| Conservative | 1.5%           | 75%            | Capital preservation |
| Moderate     | 3.0%           | 65%            | Balanced approach    |
| Aggressive   | 7.5%           | 55%            | Growth-oriented      |

Additional safeguards:

- `max_position_size`: Hard cap on position size in quote currency
- `max_daily_trades`: Limit number of trades per day per task
- Stop-loss is always recommended by the agent's risk rules
- OrderExecutor enforces position limits at execution time

### Notification System

All task outcomes produce notifications stored in MongoDB and delivered to the frontend:

| Type                 | Trigger                        | Contains                                |
|----------------------|--------------------------------|-----------------------------------------|
| `TRADE_CONFIRMATION` | ASK mode recommendation        | Symbol, action, confidence, entry/SL/TP |
| `TRADE_EXECUTED`     | Trade filled                   | Symbol, action, execution price         |
| `PRICE_ALERT`        | Monitoring condition triggered | Symbol, condition, current value        |
| `TASK_FAILED`        | Consecutive failure threshold  | Task name, error details                |
| `ANALYSIS_READY`     | Analysis task completed        | Symbol, summary                         |

Expired confirmations are cleaned up every 5 minutes by the scheduler.

## Embeddings (Knowledge RAG)

The knowledge system uses local embeddings for semantic search across trading strategies, trade lessons, trading
patterns, and news articles.

### Model

- **Model**: [`nomic-ai/nomic-embed-text-v1.5`](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — 768 dimensions,
  270 MB
- **Runtime**: `sentence-transformers` with ONNX backend (2-3x faster than PyTorch on CPU)
- **Inference**: Runs locally on CPU, no API key required. ~30-50ms per embedding.
- **Task prefixes**: Documents use `"search_document: "`, queries use `"search_query: "` (required by nomic)

### How It Works

1. **Document embedding**: When strategies, lessons, patterns, or articles are created, their text is formatted by
   specialized generators (`StrategyEmbeddingGenerator`, `TradeLessonEmbeddingGenerator`, `PatternEmbeddingGenerator`)
   and embedded as 768-dim vectors stored inline on the MongoDB document.
2. **Query embedding**: When the agent or user searches, the query is embedded with the `search_query:` prefix.
3. **Retrieval**: `KnowledgeRetriever` scans the relevant MongoDB documents in Python, computes cosine similarity, and
   then re-ranks matches with trading-aware metadata such as recency, symbol/timeframe overlap, validation freshness,
   and historical quality metrics.
4. **Automatic agent context**: Trading tasks build a structured retrieval query from the task description, custom
   instructions, risk level, and monitoring timeframes before injecting the returned context into the model prompt.

### Scope Notes

- **Automatic RAG corpus**: Strategies, trade lessons, and trading patterns are part of the automatic retriever.
- **News**: News articles also store embeddings, but the trading task retriever does not inject news automatically.
  Real-time and historical news continue to flow through the dedicated news tools.

### Gaming Deferral

Document embedding tasks can be deferred while a game is running to avoid CPU contention:

- **Settings**: `GET/PUT /api/v1/settings/embedding` — toggle, process list, check interval
- **Detection**: `psutil` scans running processes against a user-configured list (e.g. `["cs2.exe", "valorant.exe"]`)
- **Behavior**: When a game is detected, document embeddings wait (polling every N minutes) until the game exits, then
  resume automatically. Query embeddings (search) are never deferred.

### Key Files

| File                                     | Purpose                                                                   |
|------------------------------------------|---------------------------------------------------------------------------|
| `backend/app/knowledge/embeddings.py`    | `EmbeddingService` singleton, specialized generators, cosine similarity   |
| `backend/app/knowledge/retriever.py`     | `KnowledgeRetriever` — weighted semantic retrieval across knowledge types |
| `backend/app/knowledge/game_detector.py` | `psutil`-based game process detection                                     |
| `backend/app/knowledge/trade_learner.py` | Extracts lessons from completed trades + generates embeddings             |
| `backend/app/knowledge/pattern_miner.py` | Discovers technical patterns + generates embeddings                       |

## API Reference

### Task Endpoints (`/api/v1/agent/tasks`)

| Method | Path            | Description                             |
|--------|-----------------|-----------------------------------------|
| POST   | `/`             | Create task                             |
| GET    | `/`             | List tasks (filterable by status, type) |
| GET    | `/{id}`         | Get task details                        |
| PUT    | `/{id}`         | Update task                             |
| DELETE | `/{id}`         | Delete task                             |
| POST   | `/{id}/pause`   | Pause active task                       |
| POST   | `/{id}/resume`  | Resume paused task                      |
| POST   | `/{id}/run-now` | Execute task immediately                |
| GET    | `/{id}/history` | Get execution history                   |

## Tech Stack

| Layer        | Technology                                                                     |
|--------------|--------------------------------------------------------------------------------|
| Frontend     | React 19, TypeScript 5.7, MUI 6, TanStack Router/Query, Zustand, Framer Motion |
| Backend      | Python 3.11+, FastAPI, Beanie (MongoDB ODM), APScheduler                       |
| AI           | Claude SDK (Anthropic), nomic-embed-text-v1.5 (local, ONNX)                    |
| Exchange     | OKX REST API                                                                   |
| Database     | MongoDB (Beanie ODM)                                                           |
| Package Mgmt | uv (Python), Bun (Node)                                                        |
