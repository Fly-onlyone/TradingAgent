"""Agent decision endpoints for viewing decision history."""

from datetime import UTC, datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_active_user
from app.db.models.agent_decision import (
    AgentDecision,
    DecisionAction,
    DecisionStatus,
    DecisionType,
)
from app.db.models.user import User

router = APIRouter()


# Response schemas
class DecisionSummaryResponse(BaseModel):
    """Compact decision response for list views."""

    id: str
    session_id: str | None
    task_id: str | None

    decision_type: str
    symbol: str | None
    action: str | None
    confidence: float | None
    status: str
    summary: str

    created_at: datetime
    executed_at: datetime | None
    execution_status: str | None
    execution_error_code: str | None
    execution_error_message: str | None

    class Config:
        from_attributes = True


class ToolUsageResponse(BaseModel):
    """Tool usage information."""

    name: str
    arguments: dict
    result_summary: str | None
    execution_time_ms: int | None


class MarketContextResponse(BaseModel):
    """Market context at decision time."""

    price: float | None
    price_change_24h: float | None
    volume_24h: float | None
    rsi: float | None
    macd_signal: str | None
    trend: str | None
    support_levels: list[float]
    resistance_levels: list[float]
    news_sentiment: float | None


class DecisionDetailResponse(BaseModel):
    """Full decision response with all details."""

    id: str
    session_id: str | None
    task_id: str | None

    # Classification
    decision_type: str
    symbol: str | None
    action: str | None
    confidence: float | None
    status: str

    # Content
    summary: str
    reasoning: str
    key_factors: list[str]
    proposed_changes: dict | None = None  # For task modification decisions

    # Trade specifics
    suggested_entry: float | None
    suggested_stop_loss: float | None
    suggested_take_profit: float | None
    suggested_position_size: float | None
    risk_reward_ratio: float | None

    # Execution
    order_id: str | None
    execution_price: float | None
    execution_status: str | None
    execution_error_code: str | None
    execution_error_message: str | None

    # Context
    tools_used: list[dict]
    market_context: dict | None
    model_used: str

    # Feedback
    user_feedback: str | None
    feedback_comment: str | None

    # Timestamps
    created_at: datetime
    confirmed_at: datetime | None
    executed_at: datetime | None
    expires_at: datetime | None

    class Config:
        from_attributes = True


class DecisionListResponse(BaseModel):
    """Paginated decision list response."""

    decisions: list[DecisionSummaryResponse]
    total: int
    page: int
    page_size: int


class DecisionStatsResponse(BaseModel):
    """Decision statistics for dashboard."""

    total_decisions: int
    total_trades: int
    pending_confirmations: int
    by_type: dict[str, int]
    by_action: dict[str, int]
    by_symbol: dict[str, int]
    avg_confidence: float | None


class FeedbackCreate(BaseModel):
    """User feedback on a decision."""

    feedback: str = Field(..., pattern="^(thumbs_up|thumbs_down|neutral)$")
    comment: str | None = Field(None, max_length=500)


def decision_to_summary(decision: AgentDecision) -> DecisionSummaryResponse:
    """Convert AgentDecision to summary response."""
    return DecisionSummaryResponse(
        id=str(decision.id),
        session_id=str(decision.session_id) if decision.session_id else None,
        task_id=str(decision.task_id) if decision.task_id else None,
        decision_type=decision.decision_type.value,
        symbol=decision.symbol,
        action=decision.action.value if decision.action else None,
        confidence=decision.confidence,
        status=decision.status.value,
        summary=decision.summary,
        created_at=decision.created_at,
        executed_at=decision.executed_at,
        execution_status=decision.execution_status.value,
        execution_error_code=decision.execution_error_code,
        execution_error_message=decision.execution_error_message,
    )


def decision_to_detail(decision: AgentDecision) -> DecisionDetailResponse:
    """Convert AgentDecision to detailed response."""
    return DecisionDetailResponse(
        id=str(decision.id),
        session_id=str(decision.session_id) if decision.session_id else None,
        task_id=str(decision.task_id) if decision.task_id else None,
        decision_type=decision.decision_type.value,
        symbol=decision.symbol,
        action=decision.action.value if decision.action else None,
        confidence=decision.confidence,
        status=decision.status.value,
        summary=decision.summary,
        reasoning=decision.reasoning,
        key_factors=decision.key_factors,
        suggested_entry=decision.suggested_entry,
        suggested_stop_loss=decision.suggested_stop_loss,
        suggested_take_profit=decision.suggested_take_profit,
        suggested_position_size=decision.suggested_position_size,
        risk_reward_ratio=decision.risk_reward_ratio,
        order_id=str(decision.order_id) if decision.order_id else None,
        execution_price=decision.execution_price,
        execution_status=decision.execution_status.value,
        execution_error_code=decision.execution_error_code,
        execution_error_message=decision.execution_error_message,
        tools_used=[tool.model_dump(mode="json") for tool in decision.tools_used],
        market_context=(
            decision.market_context.model_dump(mode="json") if decision.market_context else None
        ),
        model_used=decision.model_used,
        user_feedback=decision.user_feedback,
        feedback_comment=decision.feedback_comment,
        created_at=decision.created_at,
        confirmed_at=decision.confirmed_at,
        executed_at=decision.executed_at,
        expires_at=decision.expires_at,
    )


@router.get("", response_model=DecisionListResponse)
async def list_decisions(
    decision_type: DecisionType | None = None,
    symbol: str | None = None,
    action: DecisionAction | None = None,
    status: DecisionStatus | None = None,
    session_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List decisions with filtering and pagination."""
    query = AgentDecision.find(AgentDecision.user_id == current_user.id)

    if decision_type:
        query = query.find(AgentDecision.decision_type == decision_type)
    if symbol:
        query = query.find(AgentDecision.symbol == symbol)
    if action:
        query = query.find(AgentDecision.action == action)
    if status:
        query = query.find(AgentDecision.status == status)
    if session_id:
        query = query.find(AgentDecision.session_id == PydanticObjectId(session_id))
    if start_date:
        query = query.find(AgentDecision.created_at >= start_date)
    if end_date:
        query = query.find(AgentDecision.created_at <= end_date)

    total = await query.count()

    decisions = (
        await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
    )

    return {
        "decisions": [decision_to_summary(d) for d in decisions],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/pending", response_model=DecisionListResponse)
async def list_pending_decisions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List pending decisions awaiting user confirmation."""
    now = datetime.now(UTC)

    query = AgentDecision.find(
        AgentDecision.user_id == current_user.id,
        AgentDecision.status == DecisionStatus.PENDING,
    ).find(
        # Exclude expired decisions
        {"$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}]}
    )

    total = await query.count()

    decisions = (
        await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
    )

    return {
        "decisions": [decision_to_summary(d) for d in decisions],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stats", response_model=DecisionStatsResponse)
async def get_decision_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get decision statistics for the specified period."""
    from datetime import timedelta

    start_date = datetime.now(UTC) - timedelta(days=days)

    decisions = await AgentDecision.find(
        AgentDecision.user_id == current_user.id,
        AgentDecision.created_at >= start_date,
    ).to_list()

    # Calculate stats
    by_type: dict[str, int] = {}
    by_action: dict[str, int] = {}
    by_symbol: dict[str, int] = {}
    total_confidence = 0.0
    confidence_count = 0
    total_trades = 0
    pending_count = 0

    for d in decisions:
        # By type
        type_val = d.decision_type.value
        by_type[type_val] = by_type.get(type_val, 0) + 1

        # By action
        if d.action:
            action_val = d.action.value
            by_action[action_val] = by_action.get(action_val, 0) + 1

        # By symbol
        if d.symbol:
            by_symbol[d.symbol] = by_symbol.get(d.symbol, 0) + 1

        # Confidence
        if d.confidence is not None:
            total_confidence += d.confidence
            confidence_count += 1

        # Trades
        if d.decision_type == DecisionType.TRADE_EXECUTION:
            total_trades += 1

        # Pending
        if d.status == DecisionStatus.PENDING:
            pending_count += 1

    avg_confidence = total_confidence / confidence_count if confidence_count > 0 else None

    return {
        "total_decisions": len(decisions),
        "total_trades": total_trades,
        "pending_confirmations": pending_count,
        "by_type": by_type,
        "by_action": by_action,
        "by_symbol": by_symbol,
        "avg_confidence": avg_confidence,
    }


@router.get("/symbols", response_model=list[str])
async def get_decision_symbols(
    current_user: User = Depends(get_current_active_user),
) -> list[str]:
    """Get list of unique symbols from user's decisions."""
    decisions = await AgentDecision.find(
        AgentDecision.user_id == current_user.id,
        AgentDecision.symbol != None,  # noqa: E711
    ).to_list()

    symbols = sorted(set(d.symbol for d in decisions if d.symbol))
    return symbols


@router.get("/{decision_id}", response_model=DecisionDetailResponse)
async def get_decision(
    decision_id: str,
    current_user: User = Depends(get_current_active_user),
) -> DecisionDetailResponse:
    """Get a specific decision with full details."""
    decision = await AgentDecision.find_one(
        AgentDecision.id == PydanticObjectId(decision_id),
        AgentDecision.user_id == current_user.id,
    )
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    return decision_to_detail(decision)


@router.post("/{decision_id}/confirm", response_model=DecisionDetailResponse)
async def confirm_decision(
    decision_id: str,
    current_user: User = Depends(get_current_active_user),
) -> DecisionDetailResponse:
    """Confirm a pending decision and execute it through the shared flow."""
    from app.services.agent_execution_service import get_agent_execution_service

    service = get_agent_execution_service()

    try:
        decision = await service.confirm_and_execute_decision(
            decision_id=PydanticObjectId(decision_id),
            user_id=current_user.id,
            source="api",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return decision_to_detail(decision)


@router.post("/{decision_id}/reject", response_model=DecisionDetailResponse)
async def reject_decision(
    decision_id: str,
    current_user: User = Depends(get_current_active_user),
) -> DecisionDetailResponse:
    """Reject a pending decision (for ASK mode)."""
    decision = await AgentDecision.find_one(
        AgentDecision.id == PydanticObjectId(decision_id),
        AgentDecision.user_id == current_user.id,
    )
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    if decision.status != DecisionStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Decision is not pending (current status: {decision.status.value})",
        )

    decision.reject()
    await decision.save()

    return decision_to_detail(decision)


@router.post("/{decision_id}/feedback", response_model=DecisionDetailResponse)
async def add_feedback(
    decision_id: str,
    feedback_data: FeedbackCreate,
    current_user: User = Depends(get_current_active_user),
) -> DecisionDetailResponse:
    """Add user feedback to a decision."""
    decision = await AgentDecision.find_one(
        AgentDecision.id == PydanticObjectId(decision_id),
        AgentDecision.user_id == current_user.id,
    )
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    decision.user_feedback = feedback_data.feedback
    decision.feedback_comment = feedback_data.comment
    await decision.save()

    return decision_to_detail(decision)
