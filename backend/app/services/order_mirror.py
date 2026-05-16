"""Order mirror — polls OKX every 30s and upserts into Order collection.

ATK places trades directly with OKX; this service is what makes those trades
visible in our Order collection and on the /orders UI.

Architecture notes:
- Per-user concurrency bounded by `_USER_SEMAPHORE` (default 8) — at ~50 active
  users the polling architecture stops scaling and we should switch to OKX
  WebSocket private channels (`orders` / `orders-algo` / `grid-orders-spot`)
  with this poller as a 5-minute reconciliation safety net.
- 429 backoff: per-user exponential skip after consecutive rate-limit hits.
- Notification debounce: 30s per (user, exchange_order_id) — prevents toast
  spam on rapid CAUTION→PROCEED status flips.
- Stub upgrade: the risk_hook pre-inserts a stub Order keyed on `clOrdId`
  before the agent's tool call. The mirror's $or upsert matches on EITHER
  `exchange_order_id` OR `execution_idempotency_key`, so it upgrades the stub
  in place rather than double-inserting.
- Stub janitor: orphan stubs (hook denied after insert, or ATK errored) whose
  `pending_until` has elapsed get swept every tick.
- Grid bots: NOT polled — `python-okx` doesn't expose `TradingBotAPI` in the
  installed version (0.4.0). Follow-up: switch to raw httpx or a newer SDK
  to fetch `/api/v5/tradingBot/grid/orders-algo-pending` + reconcile into
  `GridBot` collection. Bots created via the agent today are still tracked
  via their pending-stub Order rows (the agent's `algoClOrdId` flows through
  the idempotency layer like a normal clOrdId).
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import UTC, datetime
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from beanie import PydanticObjectId
from beanie.operators import Or

from app.agent.session_recorder import broadcast_message_updated
from app.db.models.agent_session import AgentSession, AgentSessionMessage
from app.db.models.notification import NotificationType
from app.db.models.order import (
    AlgoOrderType,
    Order,
    OrderSide,
    OrderSource,
    OrderStatus,
    OrderType,
)
from app.db.models.user import User
from app.exchange.okx_client import OKXClient
from app.services.notification_service import get_notification_service

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_CLORD_RE = re.compile(r"^s([0-9a-f]{24})-")  # s<24hex-session>-<4hex-nonce>

# --- Per-user concurrency + 429 backoff ---
_USER_SEMAPHORE = asyncio.Semaphore(8)
_BACKOFF: dict[str, tuple[float, int]] = {}  # user_id → (skip_until_ts, consecutive_429s)

# --- Notification debounce: 30s per (user, exchange_order_id) ---
_NOTIFY_DEBOUNCE: dict[tuple[str, str], float] = {}
_NOTIFY_WINDOW_S = 30.0


# ── State / argument mapping ────────────────────────────────────

_OKX_STATE_MAP = {
    "live": OrderStatus.OPEN,
    "partially_filled": OrderStatus.PARTIALLY_FILLED,
    "filled": OrderStatus.FILLED,
    "canceled": OrderStatus.CANCELLED,
    "mmp_canceled": OrderStatus.CANCELLED,
}


def _map_okx_state(state: str | None, current: OrderStatus | None = None) -> OrderStatus:
    """Map OKX state → our OrderStatus.

    For UNKNOWN states (OKX adds them over time), log WARN and KEEP current.
    Don't silently downgrade to PENDING — that would fire a spurious 'opened'
    toast on the next 'live' transition.
    """
    if not state:
        return current or OrderStatus.PENDING
    mapped = _OKX_STATE_MAP.get(state)
    if mapped is None:
        logger.warning("order_mirror: unknown OKX state %r — keeping current %s", state, current)
        return current or OrderStatus.PENDING
    return mapped


def _map_ord_type(t: str | None) -> OrderType:
    return {"market": OrderType.MARKET, "limit": OrderType.LIMIT}.get(t or "", OrderType.MARKET)


def _okx_ts(ms: str | None) -> datetime:
    return datetime.fromtimestamp(int(ms) / 1000, UTC) if ms else datetime.now(UTC)


def _session_from_clord(clord: str | None) -> PydanticObjectId | None:
    """Parse `s<24hex>-<4hex>` → PydanticObjectId. OKX clOrdId max is 32 chars; ours is 30.

    NOTE: OKX clOrdId character set is alphanumeric (some endpoints reject `-`).
    If pre-flight verification shows OKX rejects the hyphen form, switch the
    convention to `s<24hex><4hex>` (28 chars) and update this regex to match.
    """
    if not clord:
        return None
    m = _CLORD_RE.match(clord)
    if not m:
        return None
    try:
        return PydanticObjectId(m.group(1))
    except Exception:
        return None


# ── Notification + bubble update helpers ────────────────────────


async def _notify(
    *,
    user_id: PydanticObjectId,
    notification_type: NotificationType,
    title: str,
    body: str,
    session_id: PydanticObjectId | None = None,
) -> None:
    svc = get_notification_service()
    await svc.create_notification(
        user_id=user_id,
        title=title,
        body=body,
        notification_type=notification_type,
        session_id=session_id,
    )


async def _emit_message_updated_for(
    order: Order, new_status: str, extra: dict | None = None
) -> None:
    """Mutate the originating tool-call bubble (Chat-Session leg 4 — in-place updates).

    O(1) PK lookup via Order.agent_session_message_id; match tool_call entry
    by Order.tool_use_id. No substring matching, no arbitrary-order find_one.
    Silently skips for legacy rows / rows without the linkage fields.
    """
    if not order.agent_session_message_id or not order.tool_use_id:
        return
    target = await AgentSessionMessage.get(order.agent_session_message_id)
    if not target or not getattr(target, "tool_calls", None):
        return
    mutated = False
    for tc in target.tool_calls:
        if not isinstance(tc, dict):
            continue
        if tc.get("id") == order.tool_use_id:
            tc["result_summary"] = {
                **(tc.get("result_summary") or {}),
                "status": new_status,
                **(extra or {}),
            }
            mutated = True
            break
    if not mutated:
        logger.warning(
            "mirror: tool_use_id=%s not found in message=%s (session=%s)",
            order.tool_use_id,
            order.agent_session_message_id,
            order.agent_session_id,
        )
        return
    target.updated_at = datetime.now(UTC)
    await target.save()
    # broadcast_message_updated wants the AgentSession doc, not just the id.
    if order.agent_session_id:
        session = await AgentSession.get(order.agent_session_id)
        if session:
            await broadcast_message_updated(
                session,
                message_id=str(target.id),
                content=getattr(target, "content", "") or "",
                tool_calls=target.tool_calls,
            )


def _notify_debounce_allow(user_id: PydanticObjectId, exchange_order_id: str) -> bool:
    """30s per (user, order) debounce. Prevents toast spam on rapid status flips."""
    key = (str(user_id), exchange_order_id)
    now = time.monotonic()
    last = _NOTIFY_DEBOUNCE.get(key, 0.0)
    if (now - last) < _NOTIFY_WINDOW_S:
        return False
    _NOTIFY_DEBOUNCE[key] = now
    return True


# ── Per-user mirror ────────────────────────────────────────────


class _RateLimitedError(RuntimeError):
    """OKX returned 429 / 'Too Many Requests'."""


def _maybe_rate_limited(resp: dict[str, Any]) -> None:
    """Raise _RateLimitedError when OKX returns 50061 or HTTP 429-equivalent code."""
    if resp.get("code") in {"50061"}:  # OKX "Too many requests"
        raise _RateLimitedError(resp.get("msg") or "429")


async def _mirror_orders_for_user(user_id: PydanticObjectId, client: OKXClient) -> None:
    open_resp = await client.get_open_orders(inst_type="SPOT")
    _maybe_rate_limited(open_resp)
    history_resp = await client.get_order_history(inst_type="SPOT", limit=50)
    _maybe_rate_limited(history_resp)

    rows = (open_resp.get("data") or []) + (history_resp.get("data") or [])
    for r in rows:
        ex_id = r.get("ordId")
        if not ex_id:
            continue
        clord = r.get("clOrdId")
        match_clauses: list[Any] = [Order.exchange_order_id == ex_id]
        if clord:
            match_clauses.append(Order.execution_idempotency_key == clord)
        existing = await Order.find_one(Order.user_id == user_id, Or(*match_clauses))

        new_status = _map_okx_state(r.get("state"), current=existing.status if existing else None)
        if existing is None:
            await Order(
                user_id=user_id,
                exchange_order_id=ex_id,
                client_order_id=clord,
                agent_session_id=_session_from_clord(clord),
                symbol=r.get("instId", ""),
                side=OrderSide(r.get("side", "buy")),
                order_type=_map_ord_type(r.get("ordType")),
                status=new_status,
                quantity=float(r.get("sz") or 0),
                filled_quantity=float(r.get("accFillSz") or 0),
                price=float(r.get("px") or 0) or None,
                avg_fill_price=float(r.get("avgPx") or 0) or None,
                source=OrderSource.ATK_MIRROR,
                created_at=_okx_ts(r.get("cTime")),
            ).insert()
            continue

        was_stub = existing.symbol == "?" or existing.exchange_order_id is None
        status_changed = existing.status != new_status
        if not (was_stub or status_changed):
            continue

        # Stub upgrade — fill real fields from OKX response.
        if was_stub:
            existing.symbol = r.get("instId", existing.symbol)
            try:
                existing.side = OrderSide(r.get("side", existing.side.value))
            except (ValueError, AttributeError):
                pass
            existing.order_type = _map_ord_type(r.get("ordType"))
            existing.quantity = float(r.get("sz") or 0)
            existing.exchange_order_id = ex_id
            existing.pending_until = None

        existing.status = new_status
        existing.filled_quantity = float(r.get("accFillSz") or existing.filled_quantity)
        existing.avg_fill_price = float(r.get("avgPx") or 0) or existing.avg_fill_price
        existing.updated_at = datetime.now(UTC)
        await existing.save()

        # Don't fire UI events on the pure stub-upgrade tick — next status flip will.
        if was_stub and not status_changed:
            continue

        await _emit_message_updated_for(
            existing,
            new_status.value,
            extra={
                "filled_quantity": existing.filled_quantity,
                "avg_fill_price": existing.avg_fill_price,
            },
        )

        if not _notify_debounce_allow(user_id, ex_id):
            continue
        if new_status == OrderStatus.FILLED:
            await _notify(
                user_id=user_id,
                notification_type=NotificationType.TASK_COMPLETED,
                title=f"Order {existing.symbol} filled",
                body=(
                    f"{existing.side.value} {existing.filled_quantity} @ {existing.avg_fill_price}"
                ),
                session_id=existing.agent_session_id,
            )
        elif new_status in (OrderStatus.CANCELLED, OrderStatus.REJECTED):
            await _notify(
                user_id=user_id,
                notification_type=NotificationType.TASK_FAILED,
                title=f"Order {existing.symbol} {new_status.value}",
                body=f"qty={existing.quantity}",
                session_id=existing.agent_session_id,
            )


async def _mirror_algo_orders_for_user(user_id: PydanticObjectId, client: OKXClient) -> None:
    resp = await client.get_algo_orders(inst_type="SPOT")
    _maybe_rate_limited(resp)
    for r in resp.get("data", []):
        algo_id = r.get("algoId")
        if not algo_id:
            continue
        existing = await Order.find_one(Order.algo_order_id == algo_id, Order.user_id == user_id)
        if existing:
            continue
        algo_type_str = r.get("ordType", "")
        try:
            algo_type_enum = AlgoOrderType(algo_type_str)
        except ValueError:
            algo_type_enum = None
        await Order(
            user_id=user_id,
            algo_order_id=algo_id,
            client_order_id=r.get("algoClOrdId"),
            agent_session_id=_session_from_clord(r.get("algoClOrdId")),
            symbol=r.get("instId", ""),
            side=OrderSide(r.get("side", "buy")),
            order_type=OrderType.LIMIT,
            status=OrderStatus.OPEN,
            quantity=float(r.get("sz") or 0),
            stop_loss_price=float(r.get("slTriggerPx") or 0) or None,
            take_profit_price=float(r.get("tpTriggerPx") or 0) or None,
            is_algo=True,
            algo_type=algo_type_enum,
            source=OrderSource.ATK_MIRROR,
            created_at=_okx_ts(r.get("cTime")),
        ).insert()


# ── Stub janitor ───────────────────────────────────────────────


async def _sweep_orphan_stubs() -> None:
    """Delete pending stubs whose pending_until has elapsed without ATK ever
    returning an exchange_order_id (hook denied after insert, OR ATK errored)."""
    now = datetime.now(UTC)
    result = await Order.find(
        Order.source == OrderSource.ATK_MIRROR,
        Order.status == OrderStatus.PENDING,
        Order.exchange_order_id == None,  # noqa: E711
        Order.pending_until != None,  # noqa: E711
        Order.pending_until < now,
    ).delete()
    deleted_count = getattr(result, "deleted_count", 0)
    if deleted_count:
        logger.info("order_mirror: swept %d orphan stub Order(s)", deleted_count)


# ── Per-user backoff wrapper ───────────────────────────────────


async def _is_sandbox() -> bool:
    from app.db.models.app_settings import AppSettings

    s = await AppSettings.get_instance()
    return s.okx_sandbox


async def _process_user(user_id: PydanticObjectId, client: OKXClient) -> None:
    """Run one user's mirror tick with semaphore + backoff."""
    skip_until, count = _BACKOFF.get(str(user_id), (0.0, 0))
    now = time.monotonic()
    if now < skip_until:
        return
    try:
        async with _USER_SEMAPHORE:
            await _mirror_orders_for_user(user_id, client)
            await _mirror_algo_orders_for_user(user_id, client)
        _BACKOFF.pop(str(user_id), None)
    except _RateLimitedError:
        count = min(count + 1, 5)
        skip_for = (2**count) * 30  # mirror tick is 30s; skip 2 → 32 ticks
        _BACKOFF[str(user_id)] = (now + skip_for, count)
        logger.warning("order_mirror: user=%s rate-limited; backing off %ds", user_id, skip_for)
    except Exception:
        logger.exception("order_mirror tick failed for user=%s", user_id)


# ── Scheduler ──────────────────────────────────────────────────


async def _tick() -> None:
    """Concurrent per-user mirror with semaphore + janitor."""
    await _sweep_orphan_stubs()
    users = await User.find_all().to_list()
    if not users:
        return
    try:
        client = await OKXClient.create()
    except Exception:
        logger.exception("order_mirror: OKXClient.create failed — skipping tick")
        return
    await asyncio.gather(
        *(_process_user(u.id, client) for u in users),
        return_exceptions=True,
    )


def start() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _tick, "interval", seconds=30, id="order_mirror", coalesce=True, max_instances=1
    )
    _scheduler.start()
    logger.info("order_mirror started (interval=30s, sem=8)")


async def stop() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
