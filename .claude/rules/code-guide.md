# Code Guide

## Package Structure

```
Trading agent/
├── backend/
│   └── app/
│       ├── agent/
│       │   ├── tools/
│       │   ├── subagents/
│       │   ├── mcp_tools.py
│       │   └── trading_agent.py
│       ├── api/
│       │   ├── v1/
│       │   └── websocket/
│       ├── db/
│       │   └── models/
│       ├── exchange/
│       ├── knowledge/
│       ├── middleware/
│       ├── news/
│       ├── security/
│       ├── services/
│       ├── utils/
│       ├── config.py
│       └── main.py
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── endpoints/
│       │   ├── queryOptions/
│       │   ├── websocket/
│       │   └── client.ts
│       ├── components/
│       │   ├── agent/
│       │   ├── charts/
│       │   ├── common/
│       │   ├── data-display/
│       │   ├── effects/
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

### Pattern: MCP Tool Registration

**When to Apply**: Agent tools in `backend/app/agent/mcp_tools.py`.

Tools are plain async functions in `backend/app/agent/tools/`, wrapped as MCP tools via
`claude_agent_sdk`'s `@tool` decorator in `mcp_tools.py`:

```python
from claude_agent_sdk import tool

@tool(
    "get_ticker", "Get current ticker/price data for a trading symbol", {"symbol": str}
)
async def mcp_get_ticker(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.market_tools import get_ticker

    result = await get_ticker(symbol=args["symbol"])
    return {"content": [{"type": "text", "text": json.dumps(result)}]}
```
