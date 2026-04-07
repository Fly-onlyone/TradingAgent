"""Knowledge base endpoints for RAG and trade learning using Beanie ODM."""

import logging
from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.db.models.news import NewsArticle
from app.db.models.user import User
from app.knowledge.embeddings import (
    StrategyEmbeddingGenerator,
    TradeLessonEmbeddingGenerator,
    TradingPatternEmbeddingGenerator,
)
from app.knowledge.retriever import get_retriever

logger = logging.getLogger(__name__)

router = APIRouter()


# Strategy Knowledge Schemas
class StrategyKnowledgeCreate(BaseModel):
    name: str
    description: str
    entry_rules: dict
    exit_rules: dict
    risk_params: dict
    market_conditions: list[str] | None = None
    asset_classes: list[str] | None = None
    timeframes: list[str] | None = None


# Trade Lesson Create Schema
class TradeLessonCreate(BaseModel):
    order_id: str | None = None
    outcome: str  # "profit", "loss", "breakeven"
    profit_pct: float
    profit_amount: float | None = None
    lesson_summary: str
    market_context: dict
    mistakes: list[str] | None = None
    successes: list[str] | None = None
    recommendations: list[str] | None = None
    symbol: str
    side: str  # "buy" or "sell"
    entry_price: float
    exit_price: float
    duration_minutes: int | None = None


# Trading Pattern Create Schema
class TradingPatternCreate(BaseModel):
    pattern_name: str
    pattern_type: str  # "technical", "sentiment", "correlation"
    description: str
    conditions: dict
    success_rate: float
    sample_count: int
    avg_return: float
    avg_duration_hours: int | None = None
    symbols: list[str] | None = None
    timeframes: list[str] | None = None
    market_conditions: list[str] | None = None


class StrategyKnowledgeResponse(BaseModel):
    id: str
    name: str
    description: str
    entry_rules: dict
    exit_rules: dict
    risk_params: dict
    backtest_results: dict | None
    win_rate: float | None
    avg_return: float | None
    max_drawdown: float | None
    sharpe_ratio: float | None
    market_conditions: list | None
    asset_classes: list | None
    timeframes: list | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Trade Lesson Schemas
class TradeLessonResponse(BaseModel):
    id: str
    order_id: str | None
    outcome: str
    profit_pct: float
    profit_amount: float | None
    lesson_summary: str
    market_context: dict
    mistakes: list | None
    successes: list | None
    recommendations: list | None
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    duration_minutes: int | None
    created_at: datetime

    class Config:
        from_attributes = True


# Trading Pattern Schemas
class TradingPatternResponse(BaseModel):
    id: str
    pattern_name: str
    pattern_type: str
    description: str
    conditions: dict
    success_rate: float
    sample_count: int
    avg_return: float
    avg_duration_hours: int | None
    symbols: list | None
    timeframes: list | None
    market_conditions: list | None
    created_at: datetime
    last_validated: datetime | None

    class Config:
        from_attributes = True


# News Article Schema (for unified search results)
class NewsArticleSearchResponse(BaseModel):
    id: str
    title: str
    summary: str | None
    url: str
    sentiment_score: float | None
    mentioned_assets: list[str] | None
    published_at: datetime | None

    class Config:
        from_attributes = True


# Search Schema
class KnowledgeSearchRequest(BaseModel):
    query: str
    search_type: str = "all"  # all, strategies, lessons, patterns, news
    limit: int = 10


class KnowledgeSearchResponse(BaseModel):
    strategies: list[StrategyKnowledgeResponse] = []
    lessons: list[TradeLessonResponse] = []
    patterns: list[TradingPatternResponse] = []
    news: list[NewsArticleSearchResponse] = []


def article_to_search_response(article: NewsArticle) -> NewsArticleSearchResponse:
    return NewsArticleSearchResponse(
        id=str(article.id),
        title=article.title,
        summary=article.summary,
        url=article.url,
        sentiment_score=article.sentiment_score,
        mentioned_assets=article.mentioned_assets,
        published_at=article.published_at,
    )


def strategy_to_response(strategy: StrategyKnowledge) -> StrategyKnowledgeResponse:
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
    existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == data.name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A strategy named '{data.name}' already exists (id: {existing.id})",
        )

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

    # Generate and store embedding for semantic search
    try:
        generator = StrategyEmbeddingGenerator()
        strategy.embedding = await generator.generate_strategy_embedding(data.model_dump())
        if strategy.embedding is not None:
            await strategy.save()
    except Exception:
        logger.warning("Failed to generate embedding for strategy %s", strategy.id, exc_info=True)

    return strategy_to_response(strategy)


@router.get("/strategies", response_model=list[StrategyKnowledgeResponse])
async def list_strategy_knowledge(
    market_condition: str | None = None,
    asset_class: str | None = None,
    timeframe: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> list[StrategyKnowledgeResponse]:
    """List strategies in the knowledge base."""
    query = StrategyKnowledge.find()

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
    outcome: str | None = None,
    symbol: str | None = None,
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

    return [lesson_to_response(lesson) for lesson in lessons]


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


@router.post("/lessons", response_model=TradeLessonResponse)
async def create_trade_lesson(
    data: TradeLessonCreate,
    current_user: User = Depends(get_current_active_user),
) -> TradeLessonResponse:
    """Create a new trade lesson in the knowledge base."""
    lesson = TradeLesson(
        order_id=PydanticObjectId(data.order_id) if data.order_id else None,
        outcome=data.outcome,
        profit_pct=data.profit_pct,
        profit_amount=data.profit_amount,
        lesson_summary=data.lesson_summary,
        market_context=data.market_context,
        mistakes=data.mistakes,
        successes=data.successes,
        recommendations=data.recommendations,
        symbol=data.symbol,
        side=data.side,
        entry_price=data.entry_price,
        exit_price=data.exit_price,
        duration_minutes=data.duration_minutes,
    )
    await lesson.insert()

    # Generate and store embedding for semantic search
    try:
        generator = TradeLessonEmbeddingGenerator()
        lesson.embedding = await generator.generate_lesson_embedding(data.model_dump())
        if lesson.embedding is not None:
            await lesson.save()
    except Exception:
        logger.warning("Failed to generate embedding for lesson %s", lesson.id, exc_info=True)

    return lesson_to_response(lesson)


# Trading Patterns Endpoints
@router.get("/patterns", response_model=list[TradingPatternResponse])
async def list_trading_patterns(
    pattern_type: str | None = None,
    min_success_rate: float | None = None,
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


@router.post("/patterns", response_model=TradingPatternResponse)
async def create_trading_pattern(
    data: TradingPatternCreate,
    current_user: User = Depends(get_current_active_user),
) -> TradingPatternResponse:
    """Create a new trading pattern in the knowledge base."""
    existing = await TradingPattern.find_one(TradingPattern.pattern_name == data.pattern_name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A pattern named '{data.pattern_name}' already exists (id: {existing.id})",
        )

    pattern = TradingPattern(
        pattern_name=data.pattern_name,
        pattern_type=data.pattern_type,
        description=data.description,
        conditions=data.conditions,
        success_rate=data.success_rate,
        sample_count=data.sample_count,
        avg_return=data.avg_return,
        avg_duration_hours=data.avg_duration_hours,
        symbols=data.symbols,
        timeframes=data.timeframes,
        market_conditions=data.market_conditions,
    )
    await pattern.insert()

    # Generate and store embedding for semantic search
    try:
        generator = TradingPatternEmbeddingGenerator()
        pattern.embedding = await generator.generate_pattern_embedding(data.model_dump())
        if pattern.embedding is not None:
            await pattern.save()
    except Exception:
        logger.warning("Failed to generate embedding for pattern %s", pattern.id, exc_info=True)

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
    retriever = get_retriever()
    results = await retriever.search_all(
        request.query,
        limit_per_type=request.limit // 3 or 3,
    )

    return {
        "strategies": [strategy_to_response(s) for s, _ in results["strategies"]],
        "lessons": [lesson_to_response(lesson) for lesson, _ in results["lessons"]],
        "patterns": [pattern_to_response(p) for p, _ in results["patterns"]],
        "news": [article_to_search_response(a) for a, _ in results.get("news", [])],
    }
