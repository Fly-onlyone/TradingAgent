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

### Pattern: Frontend Component Animations

**When to Apply**: Every new React component in `frontend/src/`.

Always add Framer Motion entry animations to new components. Reuse variants from
`frontend/src/utils/animations/variants.ts` — never create ad-hoc spring values.

**Variant selection by component type:**

| Component Type      | Variant                             | Import        |
|---------------------|-------------------------------------|---------------|
| Page / route        | `pageEntrance`                      | `variants.ts` |
| Card in a grid/list | `staggerCascade` (container + item) | `variants.ts` |
| Table / list rows   | `listStagger` (container + item)    | `variants.ts` |
| Modal / dialog      | `scaleIn`                           | `variants.ts` |
| Panel sliding in    | `slideIn.left/right/bottom`         | `variants.ts` |
| Scroll-triggered    | `scrollReveal.up/down/left/right`   | `variants.ts` |
| Interactive card    | `createCardHover(primaryRgb)`       | `variants.ts` |

**Spring configs** (for custom transitions): `spring.snappy`, `spring.bouncy`, `spring.gentle`.

**Reduced motion**: Always respect `useReducedMotion()` hook — skip or shorten animations when true.

**Minimal example (card in a stagger grid):**

```tsx
import {motion} from "framer-motion";
import {staggerCascade} from "@/utils/animations/variants";

<motion.div variants={staggerCascade.container} initial="hidden" animate="visible">
    {items.map((item) => (
        <motion.div key={item.id} variants={staggerCascade.item}>
            ...
        </motion.div>
    ))}
</motion.div>
```
