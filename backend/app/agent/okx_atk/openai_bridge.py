"""ATK MCP → OpenAI function-call format bridge.

Why not the official `openai-agents-python` SDK? Our `RiskManager` needs
DYNAMIC context (current portfolio, position sizes, AppSettings) for each
write. The Agents SDK's `require_approval` is static (per-tool-name allowlist)
— for dynamic gating we'd have to subclass `MCPServerStdio.call_tool`, which
is exactly the bridge concept one layer up. Keeping the bridge here means the
risk hook runs identically in both runtimes (same atk_pretool_hook function).
"""

from __future__ import annotations

import logging
from typing import Any

from app.agent.okx_atk.mcp_client import get_client
from app.agent.okx_atk.risk_hook import atk_pretool_hook, cleanup_pending_stub
from app.agent.okx_atk.tool_curation import MCP_SERVER_NAME

logger = logging.getLogger(__name__)

OPENAI_NAME_PREFIX = "okx_"  # avoid clash with native tool names
_DESCRIPTION_LIMIT = 1024  # OpenAI hard cap on function description length


async def translate_mcp_tools_to_openai() -> list[dict[str, Any]]:
    """Return OpenAI function-call definitions for every loaded ATK tool."""
    try:
        mcp_tools = await get_client().list_tools()
    except Exception:
        logger.exception("openai_bridge: failed to list ATK tools — returning empty set")
        return []
    out: list[dict[str, Any]] = []
    for t in mcp_tools:
        out.append(
            {
                "type": "function",
                "function": {
                    "name": f"{OPENAI_NAME_PREFIX}{t.name}",
                    "description": (t.description or "")[:_DESCRIPTION_LIMIT],
                    "parameters": t.inputSchema or {"type": "object", "properties": {}},
                },
            }
        )
    return out


def is_atk_tool(openai_tool_name: str) -> bool:
    return openai_tool_name.startswith(OPENAI_NAME_PREFIX)


async def invoke_atk_tool(
    openai_tool_name: str,
    args: dict[str, Any],
    *,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Risk-gate + proxy. Returns a plain dict consistent with our other tool returns.

    Same risk hook as the Anthropic runtime — atk_pretool_hook is the single
    source of truth for trade-write gating. If the hook denies after the
    idempotency stub is inserted, clean up the stub so it doesn't linger.
    """
    if not is_atk_tool(openai_tool_name):
        return {"error": f"not an ATK tool: {openai_tool_name}"}
    mcp_name = openai_tool_name[len(OPENAI_NAME_PREFIX) :]

    decision = await atk_pretool_hook(
        # Use the same `mcp__okx__<bare>` shape the hook expects for consistency
        # with the Anthropic side — the hook strips the prefix internally.
        tool_name=f"mcp__{MCP_SERVER_NAME}__{mcp_name}",
        tool_input=args,
        user_id=user_id,
    )
    if decision.get("decision") == "deny":
        # If the hook inserted a stub before denying (place tools do this
        # immediately before the RiskManager call), clean it up so /orders
        # doesn't render a phantom "?" row.
        clord = args.get("clOrdId") or args.get("algoClOrdId")
        if clord and user_id:
            await cleanup_pending_stub(clord, user_id)
        return {"error": "blocked_by_risk_hook", "reason": decision.get("reason")}

    return await get_client().call_tool(mcp_name, args)
