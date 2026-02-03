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
│       ├── config.py           # Settings (pydantic-settings)
│       └── main.py             # FastAPI app entry
├── frontend/
│   └── src/
│       ├── api/                # API client functions
│       ├── components/         # React components
│       ├── hooks/              # Custom React hooks
│       ├── routes/             # TanStack Router pages
│       ├── store/              # Zustand stores
│       ├── theme/              # MUI theme config
│       ├── types/              # TypeScript types
│       └── utils/              # Utility functions
├── pyproject.toml              # Python dependencies (uv/hatch)
└── frontend/package.json       # Node dependencies
```

---

## Naming Conventions

### Python (Backend)

| Type | Pattern | Example |
|------|---------|---------|
| Classes | `PascalCase` | `TradingAgent`, `OrderExecutor` |
| Functions | `snake_case` | `get_market_data`, `calculate_risk` |
| Constants | `UPPER_SNAKE` | `MAX_POSITION_SIZE`, `DEFAULT_TIMEFRAME` |
| Files | `snake_case.py` | `trading_agent.py`, `market_tools.py` |
| Private | `_snake_case` | `_internal_state`, `_validate_input` |

### TypeScript (Frontend)

| Type | Pattern | Example |
|------|---------|---------|
| Components | `PascalCase` | `OrderForm`, `MarketChart` |
| Functions | `camelCase` | `getUserOrders`, `formatPrice` |
| Constants | `UPPER_SNAKE` | `API_BASE_URL`, `MAX_RETRIES` |
| Interfaces/Types | `PascalCase` | `OrderResponse`, `UserState` |
| Files (components) | `PascalCase.tsx` | `OrderForm.tsx` |
| Files (utilities) | `camelCase.ts` | `formatDate.ts` |
| Files (tests) | `*.test.ts(x)` | `OrderForm.test.tsx` |
| Hooks | `useCamelCase` | `useMarketData`, `useAuth` |

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
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "orders"  # collection name
```

**Anti-Patterns**:
- Using SQLAlchemy patterns with Beanie
- Synchronous database calls (use `await`)

---

### Pattern 2: FastAPI Endpoint

**When to Apply**: All REST API endpoints.

```python
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("/{order_id}")
async def get_order(order_id: str, user: User = Depends(get_current_user)):
    order = await Order.get(order_id)
    if not order or order.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Order not found")
    return order
```

---

### Pattern 3: Claude Tool Definition

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

---

### Pattern 4: TanStack Query Hook

**When to Apply**: Server state in frontend.

```typescript
import { useQuery } from '@tanstack/react-query';
import { getOrders } from '@/api/orders';

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: getOrders,
    staleTime: 30_000,  // 30 seconds
  });
}
```

---

### Pattern 5: Zustand Store

**When to Apply**: Client-side state (UI, preferences).

```typescript
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

---

## Code Style

### Python Imports Order

1. Standard library
2. Third-party packages
3. Local imports (absolute)
4. Local imports (relative)

```python
import json
from datetime import datetime

from fastapi import APIRouter, Depends
from beanie import Document

from backend.app.config import settings
from .models import Order
```

### TypeScript Imports Order

1. React/framework imports
2. Third-party libraries
3. Internal modules (absolute `@/`)
4. Relative imports
5. Type imports
6. Style imports

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button } from '@mui/material';

import { useAuth } from '@/hooks/useAuth';
import { OrderForm } from './OrderForm';
import type { Order } from '@/types';
```

---

## Best Practices

- **Async/Await**: All database and API calls must be async
- **Type Safety**: Use Pydantic models for Python, TypeScript interfaces for frontend
- **Error Handling**: Use HTTPException with appropriate status codes
- **Validation**: Validate at API boundaries with Pydantic/Zod
- **Early Returns**: Reduce nesting with guard clauses
- **Single Responsibility**: One component/function = one purpose
