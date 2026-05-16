"""ATK health + proxy endpoints.

`/api/v1/atk/health` — read-only status of the ATK child process. Powers
the green/red `AtkStatusChip` in the app status bar.

`/api/v1/atk/proxy/{tool_name}` — server-side proxy so the UI can fire
ATK cancel actions through the same risk hook as agent calls. Strict
allowlist: only cancels are exposed; placing orders / leverage changes /
transfers must go through the agent (where RiskManager's full context
applies). Same auth as the rest of v1: any authenticated user.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.agent.okx_atk.mcp_client import get_client
from app.agent.okx_atk.openai_bridge import invoke_atk_tool
from app.agent.okx_atk.process_manager import get_manager
from app.api.v1.auth import get_current_active_user
from app.db.models.user import User

router = APIRouter()

# Cancel-only allowlist — the UI cannot place orders. New cancellable categories
# go here; new write categories must NOT.
UI_PROXY_ALLOWLIST = frozenset(
    {
        "okx_spot_cancel_order",
        "okx_spot_batch_cancel_orders",
        "okx_spot_cancel_algo_order",
        "okx_swap_cancel_order",
        "okx_swap_batch_cancel_orders",
        "okx_swap_cancel_algo_order",
        "okx_grid_stop_order",
        "okx_dca_stop_order",
    }
)


@router.get("/health")
async def health(_user: User = Depends(get_current_active_user)) -> dict[str, Any]:
    mgr = get_manager()
    client = get_client()
    tool_count = 0
    last_error: str | None = None
    if mgr.is_running:
        try:
            tool_count = len(await client.list_tools())
        except Exception as exc:
            last_error = str(exc)
    return {
        "running": mgr.is_running,
        "accepting": mgr.is_accepting(),
        "profile": mgr.profile,
        "tool_count": tool_count,
        "last_error": last_error,
    }


@router.post("/proxy/{tool_name}")
async def proxy(
    tool_name: str,
    args: dict[str, Any],
    user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    """Cancel-only ATK proxy. Returns ATK response or 4xx on deny."""
    if tool_name not in UI_PROXY_ALLOWLIST:
        raise HTTPException(403, f"tool {tool_name} not exposed to UI")
    result = await invoke_atk_tool(tool_name, args, user_id=str(user.id))
    if "error" in result and isinstance(result["error"], str):
        # blocked_by_risk_hook etc.
        raise HTTPException(400, result.get("reason") or result["error"])
    return result
