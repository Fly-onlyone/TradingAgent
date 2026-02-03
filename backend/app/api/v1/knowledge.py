"""Knowledge base endpoints for RAG and trade learning using Beanie ODM."""

from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db.models.user import User
from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.api.v1.auth import get_current_active_user

router = APIRouter()


# Strategy Knowledge Schemas
class StrategyKnowledgeCreate(BaseModel):
    """Strategy knowledge creation schema."""

    name: str
    description: str
    entry_rules: dict
    exit_rules: dict
    risk_params: dict
    market_conditions: Optional[list[str]] = None
    asset_classes: Optional[list[str]] = None
    timeframes: Optional[list[str]] = None


class StrategyKnowledgeResponse(BaseModel):
    """Strategy knowledge response schema."""

    id: str
    name: str
    description: str
    entry_rules: dict
    exit_rules: dict
    risk_params: dict
    backtest_results: Optional[dict]
    win_rate: Optional[float]
    avg_return: Optional[float]
    max_drawdown: Optional[float]
    sharpe_ratio: Optional[float]
    market_conditions: Optional[list]
    asset_classes: Optional[list]
    timeframes: Optional[list]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Trade Lesson Schemas
class TradeLessonResponse(BaseModel):
    """Trade lesson response schema."""

    id: str
    order_id: Optional[str]
    outcome: str
    profit_pct: float
    profit_amount: Optional[float]
    lesson_summary: str
    market_context: dict
    mistakes: Optional[list]
    successes: Optional[list]
    recommendations: Optional[list]
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    duration_minutes: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# Trading Pattern Schemas
class TradingPatternResponse(BaseModel):
    """Trading pattern response schema."""

    id: str
    pattern_name: str
    pattern_type: str
    description: str
    conditions: dict
    success_rate: float
    sample_count: int
    avg_return: float
    avg_duration_hours: Optional[int]
    symbols: Optional[list]
    timeframes: Optional[list]
    market_conditions: Optional[list]
    created_at: datetime
    last_validated: Optional[datetime]

    class Config:
        from_attributes = True


# Search Schema
class KnowledgeSearchRequest(BaseModel):
    """Knowledge search request schema."""

    query: str
    search_type: str = "all"  # all, strategies, lessons, patterns
    limit: int = 10


class KnowledgeSearchResponse(BaseModel):
    """Knowledge search response schema."""

    strategies: list[StrategyKnowledgeResponse] = []
    lessons: list[TradeLessonResponse] = []
    patterns: list[TradingPatternResponse] = []


def strategy_to_response(strategy: StrategyKnowledge) -> StrategyKnowledgeResponse:
    """Convert StrategyKnowledge document to response schema."""
    return StrategyKnowledgeResponse(
        id=str(strategy.id),
        name=strategy.name,
        description=strategy.description,
        entry_rules=strategy.entry_rules,
        exit_rules=strategy.exit_rules,
        risk_params=strategy.risk_params,
        backtest_results=strategy.backtest_results,
        win_rate=strategy.win_rate,
        avg_return=strategy.avg_return,
        max_drawdown=strategy.max_drawdown,
        sharpe_ratio=strategy.sharpe_ratio,
        market_conditions=strategy.market_conditions,
        asset_classes=strategy.asset_classes,
        timeframes=strategy.timeframes,
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
    )


def lesson_to_response(lesson: TradeLesson) -> TradeLessonResponse:
    """Convert TradeLesson document to response schema."""
    return TradeLessonResponse(
        id=str(lesson.id),
        order_id=str(lesson.order_id) if lesson.order_id else None,
        outcome=lesson.outcome,
        profit_pct=lesson.profit_pct,
        profit_amount=lesson.profit_amount,
        lesson_summary=lesson.lesson_summary,
        market_context=lesson.market_context,
        mistakes=lesson.mistakes,
        successes=lesson.successes,
        recommendations=lesson.recommendations,
        symbol=lesson.symbol,
        side=lesson.side,
        entry_price=lesson.entry_price,
        exit_price=lesson.exit_price,
        duration_minutes=lesson.duration_minutes,
        created_at=lesson.created_at,
    )


def pattern_to_response(pattern: TradingPattern) -> TradingPatternResponse:
    """Convert TradingPattern document to response schema."""
    return TradingPatternResponse(
        id=str(pattern.id),
        pattern_name=pattern.pattern_name,
        pattern_type=pattern.pattern_type,
        description=pattern.description,
        conditions=pattern.conditions,
        success_rate=pattern.success_rate,
        sample_count=pattern.sample_count,
        avg_return=pattern.avg_return,
        avg_duration_hours=pattern.avg_duration_hours,
        symbols=pattern.symbols,
        timeframes=pattern.timeframes,
        market_conditions=pattern.market_conditions,
        created_at=pattern.created_at,
        last_validated=pattern.last_validated,
    )


# Strategy Knowledge Endpoints
@router.post("/strategies", response_model=StrategyKnowledgeResponse)
async def create_strategy_knowledge(
    data: StrategyKnowledgeCreate,
    current_user: User = Depends(get_current_active_user),
) -> StrategyKnowledgeResponse:
    """Create a new strategy in the knowledge base."""
    strategy = StrategyKnowledge(
        name=data.name,
        description=data.description,
        entry_rules=data.entry_rules,
        exit_rules=data.exit_rules,
        risk_params=data.risk_params,
        market_conditions=data.market_conditions,
        asset_classes=data.asset_classes,
        timeframes=data.timeframes,
    )
    await strategy.insert()

    # TODO: Generate and store embedding for the strategy
    # This will be implemented in Phase 3 (Knowledge Database)

    return strategy_to_response(strategy)


@router.get("/strategies", response_model=list[StrategyKnowledgeResponse])
async def list_strategy_knowledge(
    market_condition: Optional[str] = None,
    asset_class: Optional[str] = None,
    timeframe: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> list[StrategyKnowledgeResponse]:
    """List strategies in the knowledge base."""
    query = StrategyKnowledge.find()

    # Filter by array contains
    if market_condition:
        query = query.find({"market_conditions": market_condition})
    if asset_class:
        query = query.find({"asset_classes": asset_class})
    if timeframe:
        query = query.find({"timeframes": timeframe})

    strategies = (
        await query.sort(-StrategyKnowledge.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return [strategy_to_response(s) for s in strategies]


@router.get("/strategies/{strategy_id}", response_model=StrategyKnowledgeResponse)
async def get_strategy_knowledge(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
) -> StrategyKnowledgeResponse:
    """Get a specific strategy from the knowledge base."""
    strategy = await StrategyKnowledge.get(PydanticObjectId(strategy_id))
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy_to_response(strategy)


# Trade Lessons Endpoints
@router.get("/lessons", response_model=list[TradeLessonResponse])
async def list_trade_lessons(
    outcome: Optional[str] = None,
    symbol: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> list[TradeLessonResponse]:
    """List trade lessons."""
    query = TradeLesson.find()

    if outcome:
        query = query.find(TradeLesson.outcome == outcome)
    if symbol:
        query = query.find(TradeLesson.symbol == symbol)

    lessons = (
        await query.sort(-TradeLesson.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return [lesson_to_response(l) for l in lessons]


@router.get("/lessons/{lesson_id}", response_model=TradeLessonResponse)
async def get_trade_lesson(
    lesson_id: str,
    current_user: User = Depends(get_current_active_user),
) -> TradeLessonResponse:
    """Get a specific trade lesson."""
    lesson = await TradeLesson.get(PydanticObjectId(lesson_id))
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson_to_response(lesson)


# Trading Patterns Endpoints
@router.get("/patterns", response_model=list[TradingPatternResponse])
async def list_trading_patterns(
    pattern_type: Optional[str] = None,
    min_success_rate: Optional[float] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> list[TradingPatternResponse]:
    """List trading patterns."""
    query = TradingPattern.find()

    if pattern_type:
        query = query.find(TradingPattern.pattern_type == pattern_type)
    if min_success_rate:
        query = query.find(TradingPattern.success_rate >= min_success_rate)

    patterns = (
        await query.sort(-TradingPattern.success_rate)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return [pattern_to_response(p) for p in patterns]


@router.get("/patterns/{pattern_id}", response_model=TradingPatternResponse)
async def get_trading_pattern(
    pattern_id: str,
    current_user: User = Depends(get_current_active_user),
) -> TradingPatternResponse:
    """Get a specific trading pattern."""
    pattern = await TradingPattern.get(PydanticObjectId(pattern_id))
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
    return pattern_to_response(pattern)


# Semantic Search Endpoint
@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    request: KnowledgeSearchRequest,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Search knowledge base using semantic similarity.

    This endpoint uses embeddings to find relevant strategies, lessons, and patterns
    based on the natural language query.
    """
    # TODO: Implement vector similarity search
    # For now, return empty results - will be implemented in Phase 3

    return {
        "strategies": [],
        "lessons": [],
        "patterns": [],
    }
