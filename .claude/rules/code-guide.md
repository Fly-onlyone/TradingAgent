# Code Guide

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
