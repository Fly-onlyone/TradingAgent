# Code Guide

## Package Structure

```
Trading agent/
├── backend/
│   └── app/
│       ├── agent/
│       │   ├── tools/
│       │   ├── subagents/
│       │   └── trading_agent.py
│       ├── api/
│       │   ├── v1/
│       │   └── websocket/
│       ├── db/
│       │   └── models/
│       ├── exchange/
│       ├── knowledge/
│       ├── news/
│       ├── services/
│       ├── config.py
│       └── main.py
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── endpoints/
│       │   ├── websocket/
│       │   └── client.ts
│       ├── components/
│       │   ├── agent/
│       │   ├── charts/
│       │   ├── common/
│       │   ├── data-display/
│       │   ├── layout/
│       │   ├── trades/
│       │   └── trading/
│       ├── hooks/
│       ├── routes/
│       │   ├── admin/
│       │   ├── auth/
│       │   ├── knowledge/
│       │   ├── strategies/
│       │   ├── tasks/
│       │   └── trades/
│       ├── store/
│       ├── theme/
│       ├── types/
│       └── utils/
├── pyproject.toml
└── frontend/package.json
```

---

## Code Patterns

### Pattern: Claude Tool Definition

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
