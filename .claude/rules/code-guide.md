# Code Guide

## Package Structure

```
Trading agent/
├── backend/
│   └── app/
│       ├── agent/              # AI trading agent
│       │   ├── tools/          # Claude tool implementations
│       │   ├── subagents/      # Specialized analyst agents
│       │   └── trading_agent.py
│       ├── api/
│       │   ├── v1/             # REST API endpoints
│       │   └── websocket/      # Real-time connections
│       ├── db/
│       │   └── models/         # Beanie ODM models
│       ├── exchange/           # OKX integration
│       ├── knowledge/          # RAG system
│       ├── news/               # News intelligence
│       ├── services/           # Business logic (P&L, notifications)
│       ├── config.py           # Settings (pydantic-settings)
│       └── main.py             # FastAPI app entry
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── endpoints/      # Per-resource API clients
│       │   ├── websocket/      # WebSocket handlers
│       │   └── client.ts       # Axios instance + interceptors
│       ├── components/
│       │   ├── agent/          # Agent chat UI
│       │   ├── charts/         # Trading chart components
│       │   ├── common/         # Shared (PageTransition, etc.)
│       │   ├── data-display/   # Tables, cards
│       │   ├── layout/         # AppShell, Sidebar, Header
│       │   ├── trades/         # Trade summary, tables
│       │   └── trading/        # Order forms, panels
│       ├── hooks/              # Custom React hooks
│       ├── routes/
│       │   ├── admin/          # Database management (superuser)
│       │   ├── auth/           # Login, register
│       │   ├── knowledge/      # Knowledge base UI
│       │   ├── strategies/     # Strategy management
│       │   ├── tasks/          # Scheduled trading tasks
│       │   └── trades/         # Trade history + P&L
│       ├── store/              # Zustand stores (uiStore, authStore, tradeStore)
│       ├── theme/              # MUI theme config
│       ├── types/              # TypeScript types (per-resource files)
│       └── utils/              # Utility functions
├── pyproject.toml              # Python dependencies (uv/hatch)
└── frontend/package.json       # Node dependencies
```

---

## Code Patterns

### Pattern 1: Beanie Document Model

**When to Apply**: All MongoDB collections.

```python
from beanie import Document
from pydantic import Field
from datetime import datetime

class Order(Document):
    user_id: str
    symbol: str
    side: str  # "buy" | "sell"
    quantity: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(datetime.UTC))

    class Settings:
        name = "orders"  # collection name
```

**Anti-Patterns**:
- Using SQLAlchemy patterns with Beanie
- Synchronous database calls (use `await`)

---

### Pattern 2: Claude Tool Definition

**When to Apply**: Agent tools in `backend/app/agent/tools/`.

```python
def get_tool_definitions() -> list[dict]:
    return [
        {
            "name": "get_market_price",
            "description": "Get current price for a trading pair",
            "input_schema": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Trading pair (e.g., BTC-USDT)"}
                },
                "required": ["symbol"]
            }
        }
    ]

async def execute_tool(name: str, args: dict) -> str:
    if name == "get_market_price":
        return await _get_market_price(args["symbol"])
    raise ValueError(f"Unknown tool: {name}")
```
