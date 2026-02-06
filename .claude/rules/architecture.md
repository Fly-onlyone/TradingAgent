# Architecture

## System Design

Trading Agent is a full-stack application with AI-powered cryptocurrency trading capabilities.

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│              React 19 + TanStack Router + MUI                   │
├─────────────────────────────────────────────────────────────────┤
│                      API Layer (FastAPI)                        │
│    REST endpoints: /api/v1/{auth,orders,strategies,market,...}  │
│                    WebSocket: real-time data                    │
├─────────────────────────────────────────────────────────────────┤
│                     Trading Agent (Claude)                      │
│    ┌─────────────┬─────────────┬─────────────┬────────────┐    │
│    │  Technical  │ Fundamental │    Risk     │   Order    │    │
│    │   Analyst   │   Analyst   │   Manager   │  Executor  │    │
│    └─────────────┴─────────────┴─────────────┴────────────┘    │
│    ┌─────────────────────────────────────────────────────┐      │
│    │                   News Analyst                      │      │
│    └─────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────┤
│                        Tool Suite                               │
│  market_tools │ trading_tools │ technical_tools │ news_tools   │
│          fundamental_tools │ knowledge_tools                    │
├─────────────────────────────────────────────────────────────────┤
│                     Data Layer (MongoDB)                        │
│    Users │ Orders │ Strategies │ Knowledge │ News │ Market      │
├─────────────────────────────────────────────────────────────────┤
│                   External Integrations                         │
│           OKX Exchange │ News APIs │ OpenAI Embeddings          │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Trading Decision Flow

1. **User Request** → API receives trading query
2. **TradingAgent** → Claude processes with tool use
3. **Subagent Delegation** → Specialized analysis:
   - TechnicalAnalyst: Chart patterns, indicators
   - FundamentalAnalyst: On-chain metrics, valuations
   - NewsAnalyst: Sentiment from news sources
   - RiskManager: Position sizing, risk assessment
4. **OrderExecutor** → Execute via OKX with risk controls
5. **Response** → Return analysis and execution status

### Knowledge RAG Flow

1. **Query** → Knowledge tool receives search request
2. **Embedding** → OpenAI text-embedding-3-small
3. **Vector Search** → MongoDB Atlas vector search
4. **Context Assembly** → Retrieve relevant documents
5. **Response** → Claude uses context for informed answers

## Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| TradingAgent | Main orchestrator with Claude tool use | `backend/app/agent/trading_agent.py` |
| TechnicalAnalyst | Technical indicator analysis | `backend/app/agent/subagents/technical_analyst.py` |
| FundamentalAnalyst | Fundamental value analysis | `backend/app/agent/subagents/fundamental_analyst.py` |
| RiskManager | Position sizing & risk controls | `backend/app/agent/subagents/risk_manager.py` |
| OrderExecutor | Trade execution with OKX | `backend/app/agent/subagents/order_executor.py` |
| NewsAnalyst | News sentiment analysis | `backend/app/agent/subagents/news_analyst.py` |
| OKXClient | Exchange API integration | `backend/app/exchange/` |
| KnowledgeRetriever | RAG document retrieval | `backend/app/knowledge/retriever.py` |
| EmbeddingService | Vector embedding generation | `backend/app/knowledge/embeddings.py` |

## State Management

### Backend
- **Database**: MongoDB with Beanie ODM (async)
- **Session**: JWT tokens for authentication
- **Cache**: In-memory for market data (future: Redis)

### Frontend
- **Server State**: TanStack Query (caching, sync)
- **Client State**: Zustand (UI state, preferences)
- **Forms**: react-hook-form + zod validation

## External Integrations

| Service | Purpose | Configuration |
|---------|---------|---------------|
| OKX | Cryptocurrency exchange | `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE` |
| Anthropic | Claude AI agent | `ANTHROPIC_API_KEY` |
| OpenAI | Embeddings (text-embedding-3-small) | `OPENAI_API_KEY` |
| MongoDB | Primary database | `MONGODB_URL` |

## Module Dependencies

```
main.py
  └── api/v1/
        ├── auth.py      → db/models/user.py
        ├── orders.py    → db/models/order.py, services/pnl_calculator.py
        ├── strategies.py → db/models/strategy.py
        ├── market.py    → exchange/okx_client.py
        ├── knowledge.py → knowledge/retriever.py
        ├── news.py      → db/models/news.py
        ├── admin.py     → db/session.py (direct MongoDB access)
        ├── agent_tasks.py → db/models/agent_task.py
        ├── agent_sessions.py → db/models/agent_session.py
        ├── agent_decisions.py → db/models/agent_decision.py
        └── notifications.py → db/models/notification.py, services/notification_service.py

agent/trading_agent.py
  ├── tools/*.py         (6 tool modules)
  └── subagents/*.py     (5 subagent modules)

knowledge/
  ├── embeddings.py      → OpenAI API
  └── retriever.py       → db/models/knowledge.py
```

## Testing Strategy

| Test Type | Location | Run Command |
|-----------|----------|-------------|
| Backend Unit | `backend/tests/` | `uv run pytest` |
| Backend Coverage | `backend/tests/` | `uv run pytest --cov` |
| Frontend Unit | `frontend/src/**/*.test.*` | `cd frontend && npm test` |
