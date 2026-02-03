"""Knowledge base tools for the trading agent."""

from typing import Any, Optional

from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
from app.knowledge.retriever import KnowledgeRetriever


async def search_strategies(
    query: str,
    limit: int = 5,
) -> dict[str, Any]:
    """Search knowledge base for trading strategies.

    Args:
        query: Natural language query
        limit: Number of results to return

    Returns:
        Relevant trading strategies
    """
    retriever = KnowledgeRetriever()

    try:
        results = await retriever.search_strategies(query, limit=limit)

        strategies = []
        for strategy in results:
            strategies.append(
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
                }
            )

        return {
            "query": query,
            "strategies": strategies,
            "count": len(strategies),
        }
    except Exception as e:
        # Fallback to simple text search if vector search fails
        strategies = (
            await StrategyKnowledge.find({"$text": {"$search": query}})
            .limit(limit)
            .to_list()
        )

        if not strategies:
            # Try regex match on name/description
            strategies = (
                await StrategyKnowledge.find(
                    {
                        "$or": [
                            {"name": {"$regex": query, "$options": "i"}},
                            {"description": {"$regex": query, "$options": "i"}},
                        ]
                    }
                )
                .limit(limit)
                .to_list()
            )

        return {
            "query": query,
            "strategies": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "description": s.description,
                    "entry_rules": s.entry_rules,
                    "exit_rules": s.exit_rules,
                    "win_rate": s.win_rate,
                }
                for s in strategies
            ],
            "count": len(strategies),
            "search_type": "text_fallback",
        }


async def search_lessons(
    query: str,
    symbol: Optional[str] = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Search past trade lessons for relevant insights.

    Args:
        query: Natural language query
        symbol: Filter by trading symbol
        limit: Number of results to return

    Returns:
        Relevant trade lessons
    """
    retriever = KnowledgeRetriever()

    try:
        results = await retriever.search_lessons(query, symbol=symbol, limit=limit)

        lessons = []
        for lesson in results:
            lessons.append(
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
                }
            )

        return {
            "query": query,
            "symbol_filter": symbol,
            "lessons": lessons,
            "count": len(lessons),
        }
    except Exception as e:
        # Fallback to simple query
        query_filter = {}
        if symbol:
            query_filter["symbol"] = symbol.upper()

        lessons = (
            await TradeLesson.find(query_filter)
            .sort(-TradeLesson.created_at)
            .limit(limit)
            .to_list()
        )

        return {
            "query": query,
            "symbol_filter": symbol,
            "lessons": [
                {
                    "id": str(l.id),
                    "symbol": l.symbol,
                    "outcome": l.outcome,
                    "profit_pct": l.profit_pct,
                    "lesson_summary": l.lesson_summary,
                }
                for l in lessons
            ],
            "count": len(lessons),
            "search_type": "recent_fallback",
        }


async def search_patterns(
    query: str,
    pattern_type: Optional[str] = None,
    min_success_rate: Optional[float] = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Search for trading patterns.

    Args:
        query: Natural language query
        pattern_type: Filter by pattern type (technical, sentiment, correlation)
        min_success_rate: Minimum success rate filter
        limit: Number of results to return

    Returns:
        Relevant trading patterns
    """
    retriever = KnowledgeRetriever()

    try:
        results = await retriever.search_patterns(
            query,
            pattern_type=pattern_type,
            min_success_rate=min_success_rate,
            limit=limit,
        )

        patterns = []
        for pattern in results:
            patterns.append(
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
                }
            )

        return {
            "query": query,
            "filters": {
                "pattern_type": pattern_type,
                "min_success_rate": min_success_rate,
            },
            "patterns": patterns,
            "count": len(patterns),
        }
    except Exception as e:
        # Fallback query
        query_filter = {}
        if pattern_type:
            query_filter["pattern_type"] = pattern_type
        if min_success_rate:
            query_filter["success_rate"] = {"$gte": min_success_rate}

        patterns = (
            await TradingPattern.find(query_filter)
            .sort(-TradingPattern.success_rate)
            .limit(limit)
            .to_list()
        )

        return {
            "query": query,
            "patterns": [
                {
                    "id": str(p.id),
                    "pattern_name": p.pattern_name,
                    "pattern_type": p.pattern_type,
                    "success_rate": p.success_rate,
                    "description": p.description,
                }
                for p in patterns
            ],
            "count": len(patterns),
            "search_type": "filter_fallback",
        }
