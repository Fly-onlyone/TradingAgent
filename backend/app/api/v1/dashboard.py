"""Dashboard summary endpoints."""

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.v1.agent_decisions import DecisionSummaryResponse, decision_to_summary
from app.api.v1.agent_tasks import AgentTask
from app.api.v1.auth import get_current_active_user
from app.api.v1.market import AccountBalanceResponse, get_account_balance
from app.db.models.agent_decision import AgentDecision
from app.db.models.user import User
from app.services.pnl_calculator import TradePnL, TradeSummary, get_trades, get_trades_summary

router = APIRouter()

_DASHBOARD_SUMMARY_CACHE_TTL = 5
_dashboard_summary_cache: dict[str, tuple[float, "DashboardSummaryResponse"]] = {}


class DashboardSummaryResponse(BaseModel):
    """Return the dashboard's first-screen summary payload."""

    account: AccountBalanceResponse
    trade_summary: TradeSummary
    recent_trades: list[TradePnL]
    recent_decisions: list[DecisionSummaryResponse]
    total_decisions: int
    active_task_mode: str | None = None


def _get_cached_summary(user_id: str) -> DashboardSummaryResponse | None:
    cache_entry = _dashboard_summary_cache.get(user_id)
    if not cache_entry:
        return None

    cached_at, cached_value = cache_entry
    if time.monotonic() - cached_at >= _DASHBOARD_SUMMARY_CACHE_TTL:
        _dashboard_summary_cache.pop(user_id, None)
        return None

    return cached_value.model_copy(deep=True)


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_active_user),
) -> DashboardSummaryResponse:
    """Get the dashboard's initial summary in one request."""
    user_id = str(current_user.id)
    if cached_summary := _get_cached_summary(user_id):
        return cached_summary

    account = await get_account_balance(current_user)
    trade_summary = await get_trades_summary(current_user.id)
    recent_trades, _ = await get_trades(current_user.id, page_size=5)

    total_decisions = await AgentDecision.find(AgentDecision.user_id == current_user.id).count()
    recent_decision_docs = (
        await AgentDecision.find(AgentDecision.user_id == current_user.id)
        .sort(-AgentDecision.created_at)
        .limit(5)
        .to_list()
    )

    active_task_docs = (
        await AgentTask.find(AgentTask.user_id == current_user.id)
        .sort(-AgentTask.created_at)
        .limit(1)
        .to_list()
    )
    active_task_mode = active_task_docs[0].agent_mode.value if active_task_docs else None

    response = DashboardSummaryResponse(
        account=account,
        trade_summary=trade_summary,
        recent_trades=recent_trades,
        recent_decisions=[decision_to_summary(decision) for decision in recent_decision_docs],
        total_decisions=total_decisions,
        active_task_mode=active_task_mode,
    )
    _dashboard_summary_cache[user_id] = (time.monotonic(), response)
    return response.model_copy(deep=True)
