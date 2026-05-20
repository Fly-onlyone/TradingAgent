---
tags: [pattern]
---

# Pydantic Request Response Schemas

> Every API endpoint declares dedicated Pydantic schemas for request and response — DB models are not exposed directly.

## When to apply

Any new endpoint in `backend/app/api/v1/`.

## The pattern

```python
from pydantic import BaseModel, Field

class CreateOrderRequest(BaseModel):
    symbol: str = Field(..., description="OKX symbol, e.g. BTC-USDT")
    side: Literal["buy", "sell"]
    quantity: Decimal

class OrderResponse(BaseModel):
    id: str
    symbol: str
    status: str
    created_at: datetime

@router.post("/orders", response_model=OrderResponse)
async def create_order(payload: CreateOrderRequest) -> OrderResponse:
    ...
```

Frontend converts snake_case → camelCase in endpoint transform functions.

## Why

Decoupling DB models from API contracts lets internal schema evolve without breaking clients, and keeps Pydantic validation enforced at the edge.

## Don't

- Don't return Beanie `Document` instances directly from endpoints
- Don't reuse request schemas as response schemas — they almost always differ

## See also

- [[_index]]
- [[FastAPI]]
- [[Pydantic]]
