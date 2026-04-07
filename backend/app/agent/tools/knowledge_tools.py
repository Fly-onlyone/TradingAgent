"""Knowledge base tools for the trading agent."""

import logging
from typing import Any

from app.knowledge.retriever import get_retriever

logger = logging.getLogger(__name__)


async def search_strategies(
    query: str,
    limit: int = 5,
) -> dict[str, Any]:
    """Search knowledge base for trading strategies."""
    retriever = get_retriever()

    results = await retriever.search_strategies(query, limit=limit)

    return {
        "query": query,
        "strategies": [
            {
                "id": str(strategy.id),
                "name": strategy.name,
                "description": strategy.description,
                "entry_rules": strategy.entry_rules,
                "exit_rules": strategy.exit_rules,
                "risk_params": strategy.risk_params,
                "win_rate": strategy.win_rate,
                "avg_return": strategy.avg_return,
                "market_conditions": strategy.market_conditions,
                "timeframes": strategy.timeframes,
                "relevance_score": round(score, 3),
            }
            for strategy, score in results
        ],
        "count": len(results),
    }


async def search_lessons(
    query: str,
    symbol: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Search past trade lessons for relevant insights."""
    retriever = get_retriever()

    results = await retriever.search_lessons(query, symbol=symbol, limit=limit)

    return {
        "query": query,
        "symbol_filter": symbol,
        "lessons": [
            {
                "id": str(lesson.id),
                "symbol": lesson.symbol,
                "side": lesson.side,
                "outcome": lesson.outcome,
                "profit_pct": lesson.profit_pct,
                "lesson_summary": lesson.lesson_summary,
                "mistakes": lesson.mistakes,
                "successes": lesson.successes,
                "recommendations": lesson.recommendations,
                "market_context": lesson.market_context,
                "relevance_score": round(score, 3),
            }
            for lesson, score in results
        ],
        "count": len(results),
    }


async def search_patterns(
    query: str,
    pattern_type: str | None = None,
    min_success_rate: float | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Search for trading patterns."""
    retriever = get_retriever()

    results = await retriever.search_patterns(
        query,
        pattern_type=pattern_type,
        min_success_rate=min_success_rate,
        limit=limit,
    )

    return {
        "query": query,
        "filters": {
            "pattern_type": pattern_type,
            "min_success_rate": min_success_rate,
        },
        "patterns": [
            {
                "id": str(pattern.id),
                "pattern_name": pattern.pattern_name,
                "pattern_type": pattern.pattern_type,
                "description": pattern.description,
                "conditions": pattern.conditions,
                "success_rate": pattern.success_rate,
                "sample_count": pattern.sample_count,
                "avg_return": pattern.avg_return,
                "symbols": pattern.symbols,
                "timeframes": pattern.timeframes,
                "relevance_score": round(score, 3),
            }
            for pattern, score in results
        ],
        "count": len(results),
    }
