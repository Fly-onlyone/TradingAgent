"""Pre-tool hook for ATK write tools — FAIL-CLOSED dispatch.

Three rules:
1. Read tools pass through.
2. Write tools without a recognized shape (place / transfer / leverage / cancel) → DENY.
3. Write tools route to a category gate; any uncaught exception → DENY.

Anthropic runtime: HookMatcher(matcher="mcp__okx__*") fires for every ATK tool.
OpenAI runtime: openai_bridge.invoke_atk_tool calls this inline before proxying.

CRITICAL — RiskManager.assess_trade_risk() is a SCORING function that returns
{"recommendation": "AVOID"|"CAUTION"|"PROCEED", ...} and almost never raises.
The earlier draft only denied on exception, which let AVOID trades through.
We explicitly check `.recommendation == "AVOID"` and deny.
"""

from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId

from app.agent.okx_atk.tool_curation import (
    ATK_CANCEL_TOOLS,
    ATK_LEVERAGE_TOOLS,
    ATK_PLACE_TOOLS,
    ATK_TRANSFER_TOOLS,
    ATK_WRITE_TOOLS,
    MCP_SERVER_NAME,
    SIZE_ALIASES,
)
from app.agent.subagents.risk_manager import RiskManager
from app.db.models.app_settings import AppSettings

logger = logging.getLogger(__name__)

# Static safety caps. Promote to AppSettings fields in a follow-up if the user
# needs to tune them at runtime.
MAX_LEVERAGE_CAP: int = 10
MAX_TRANSFER_USD: float = 1000.0  # per-call cap
BOT_DEMO_BLOCK_REASON = (
    "OKX does not expose bot endpoints under demo trading; switch to live mode "
    "in Settings to use grid/DCA bots."
)

# AppSettings cache — DB round-trip per write is expensive (5-30ms) and any
# Mongo blip would deny trades. Invalidated explicitly by atk_lifecycle on
# sandbox toggle.
_SETTINGS_CACHE: dict[str, tuple[float, AppSettings]] = {}
_SETTINGS_TTL_S = 10.0


def invalidate_settings_cache() -> None:
    _SETTINGS_CACHE.clear()


async def _settings() -> AppSettings:
    now = time.monotonic()
    entry = _SETTINGS_CACHE.get("singleton")
    if entry and (now - entry[0]) < _SETTINGS_TTL_S:
        return entry[1]
    s = await AppSettings.get_instance()
    _SETTINGS_CACHE["singleton"] = (now, s)
    return s


def _strip_prefix(name: str) -> str:
    """`mcp__okx__spot_place_order` → `spot_place_order`. Identity if no prefix."""
    prefix = f"mcp__{MCP_SERVER_NAME}__"
    return name[len(prefix) :] if name.startswith(prefix) else name


def _extract_size(tool_input: dict[str, Any]) -> Decimal | None:
    """Return the first matching SIZE_ALIAS value as Decimal, else None."""
    for key in SIZE_ALIASES:
        v = tool_input.get(key)
        if v is not None and v != "":
            try:
                return Decimal(str(v))
            except Exception:
                return None
    return None


async def _check_idempotency(
    clord_id: str | None,
    user_id: str,
    tool_input: dict[str, Any],
) -> dict[str, Any] | None:
    """Insert a pending Order keyed on clOrdId so a retry returns the existing row.

    Carries chat-session linkage from ContextVars so the mirror can do an O(1)
    update of the originating tool-call bubble (Chat-Session leg 4).

    Returns a deny-decision if a duplicate is detected; None otherwise.
    """
    if not clord_id:
        return None
    from datetime import UTC, datetime, timedelta

    from app.agent.context import (
        current_message_id_var,
        current_session_id_var,
        current_tool_use_id_var,
    )
    from app.db.models.order import (
        Order,
        OrderSide,
        OrderSource,
        OrderStatus,
        OrderType,
    )

    existing = await Order.find_one(
        Order.execution_idempotency_key == clord_id,
        Order.user_id == PydanticObjectId(user_id),
    )
    if existing:
        return {
            "decision": "deny",
            "reason": f"duplicate clOrdId {clord_id} — order already pending (id={existing.id})",
        }

    # Best-effort enrich: symbol + side from args (mirror still corrects).
    symbol = tool_input.get("instId") or "?"
    side_str = tool_input.get("side", "buy")
    try:
        side = OrderSide(side_str)
    except ValueError:
        side = OrderSide.BUY

    session_id = current_session_id_var.get(None)
    message_id = current_message_id_var.get(None)
    tool_use_id = current_tool_use_id_var.get(None)

    try:
        await Order(
            user_id=PydanticObjectId(user_id),
            symbol=symbol,
            side=side,
            order_type=OrderType.MARKET,  # mirror corrects
            status=OrderStatus.PENDING,
            quantity=0.0,
            execution_idempotency_key=clord_id,
            client_order_id=clord_id,
            source=OrderSource.ATK_MIRROR,
            agent_session_id=PydanticObjectId(session_id) if session_id else None,
            agent_session_message_id=PydanticObjectId(message_id) if message_id else None,
            tool_use_id=tool_use_id,
            pending_until=datetime.now(UTC) + timedelta(minutes=2),
        ).insert()
    except Exception:
        logger.exception("idempotency pending-row insert failed for clOrdId=%s", clord_id)
        return {"decision": "deny", "reason": f"clOrdId {clord_id} collision on insert"}
    return None


async def cleanup_pending_stub(clord_id: str | None, user_id: str) -> None:
    """Delete the pending stub if a downstream rejection means ATK never received the call.

    Callers: openai_bridge.invoke_atk_tool after a deny-from-bridge, or any path
    that detects a tool-call failure before mirror reconciliation.
    """
    if not clord_id:
        return
    from app.db.models.order import Order, OrderSource, OrderStatus

    await Order.find(
        Order.execution_idempotency_key == clord_id,
        Order.user_id == PydanticObjectId(user_id),
        Order.status == OrderStatus.PENDING,
        Order.source == OrderSource.ATK_MIRROR,
        Order.exchange_order_id == None,  # noqa: E711 — Beanie comparison expects ==
    ).delete()


async def atk_pretool_hook(
    *,
    tool_name: str,
    tool_input: dict[str, Any],
    user_id: str | None = None,
) -> dict[str, Any]:
    """Returns {"decision": "allow"} or {"decision": "deny", "reason": str}."""
    bare = _strip_prefix(tool_name)

    # 1. Read tools — pass through.
    if bare not in ATK_WRITE_TOOLS:
        return {"decision": "allow"}

    # 2. User context required for ALL writes.
    if user_id is None:
        logger.warning("ATK write %s reached hook with user_id=None — denying", bare)
        return {
            "decision": "deny",
            "reason": (
                "no user_id in tool context (background invocation must set "
                "app.agent.context.current_user_id_var)"
            ),
        }

    # 3. Settings (DB, cached). Fail closed if DB unreachable.
    try:
        settings = await _settings()
    except Exception as exc:
        logger.exception("AppSettings load failed in risk hook — denying write")
        return {"decision": "deny", "reason": f"settings unavailable: {exc!s}"}

    # 3b. ATK reloading — deny writes during sandbox-toggle drain.
    from app.agent.okx_atk.process_manager import get_manager as _get_atk

    if not _get_atk().is_accepting():
        return {
            "decision": "deny",
            "reason": "ATK is reloading (sandbox profile change in progress) — retry in 5s",
        }

    # 4. Per-category dispatch.

    # 4a. Bot tools — demo-blocked (OKX doesn't expose bot endpoints in demo).
    if bare in {"grid_create_order", "dca_create_order"} and settings.okx_sandbox:
        return {"decision": "deny", "reason": BOT_DEMO_BLOCK_REASON}

    # 4b. Cancels — log + allow (no size).
    if bare in ATK_CANCEL_TOOLS:
        logger.info("ATK cancel by user=%s tool=%s args=%s", user_id, bare, tool_input)
        return {"decision": "allow"}

    # 4c. Leverage tools — enforce cap.
    if bare in ATK_LEVERAGE_TOOLS:
        try:
            lever = int(tool_input.get("lever", 0))
        except (TypeError, ValueError):
            return {"decision": "deny", "reason": "lever arg missing or non-int"}
        cap = getattr(settings, "max_leverage", MAX_LEVERAGE_CAP)
        if lever <= 0 or lever > cap:
            return {"decision": "deny", "reason": f"leverage {lever} exceeds cap {cap}"}
        logger.info("ATK leverage set by user=%s tool=%s lever=%d", user_id, bare, lever)
        return {"decision": "allow"}

    # 4d. Transfer tools — enforce per-call USD cap + ccy allowlist.
    if bare in ATK_TRANSFER_TOOLS:
        amt = tool_input.get("amt")
        ccy = tool_input.get("ccy", "")
        if amt is None:
            return {"decision": "deny", "reason": "transfer amt missing"}
        try:
            amt_dec = Decimal(str(amt))
        except Exception:
            return {"decision": "deny", "reason": f"transfer amt non-numeric: {amt!r}"}
        if ccy not in {"USDT", "USDC"}:
            return {
                "decision": "deny",
                "reason": f"transfer in {ccy} not in cap allowlist — denied",
            }
        if amt_dec > Decimal(str(MAX_TRANSFER_USD)):
            return {
                "decision": "deny",
                "reason": f"transfer amt {amt_dec} {ccy} exceeds cap {MAX_TRANSFER_USD}",
            }
        logger.info(
            "ATK transfer by user=%s amt=%s %s from=%s to=%s",
            user_id,
            amt_dec,
            ccy,
            tool_input.get("from"),
            tool_input.get("to"),
        )
        return {"decision": "allow"}

    # 4e. Place tools — full RiskManager check + idempotency.
    if bare in ATK_PLACE_TOOLS:
        sz = _extract_size(tool_input)
        if sz is None:
            # Fail-closed: unknown shape = unknown intent = deny.
            return {
                "decision": "deny",
                "reason": (
                    f"no recognized size alias in args ({sorted(SIZE_ALIASES)}) — "
                    f"keys present: {sorted(tool_input.keys())}"
                ),
            }

        # Idempotency layer (pre-insert stub keyed on clOrdId).
        clord = tool_input.get("clOrdId") or tool_input.get("algoClOrdId")
        dup = await _check_idempotency(clord, user_id, tool_input)
        if dup:
            return dup

        inst_id = tool_input.get("instId", "")
        side = tool_input.get("side", "buy")
        try:
            assessment = await RiskManager().assess_trade_risk(
                symbol=inst_id,
                side=side,
                quantity=float(sz),
            )
        except Exception as exc:
            logger.exception("RiskManager raised in hook — denying")
            return {"decision": "deny", "reason": f"risk gate exception: {exc!s}"}

        rec = (assessment or {}).get("recommendation", "AVOID")
        if rec == "AVOID":
            warnings = (assessment or {}).get("warnings") or ["no detail"]
            return {
                "decision": "deny",
                "reason": f"RiskManager: AVOID — {'; '.join(warnings)}",
            }
        # CAUTION + ACCEPTABLE + PROCEED all allow. CAUTION is a flag, not a block.
        return {"decision": "allow"}

    # 5. Catch-all — should be unreachable since ATK_WRITE_TOOLS is the union.
    logger.error("ATK write tool %s in ATK_WRITE_TOOLS but no category matched — denying", bare)
    return {"decision": "deny", "reason": f"uncategorized write tool {bare}"}
