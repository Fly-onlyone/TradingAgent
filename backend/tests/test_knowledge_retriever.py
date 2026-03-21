"""Tests for knowledge retrieval ranking and task query construction."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from app.agent.task_scheduler import AgentTaskScheduler
from app.db.models.agent_task import (
    AgentTask,
    MonitoringCondition,
    MonitoringConditionType,
    RiskLevel,
)
from app.db.models.knowledge import (
    StrategyKnowledge,
    TradeLesson,
    TradeOutcome,
    TradeSide,
    TradingPattern,
)
from app.knowledge.retriever import KnowledgeRetriever


class FakeFindQuery:
    def __init__(self, docs: list[object]) -> None:
        self.docs = docs

    async def to_list(self) -> list[object]:
        return list(self.docs)


class FakeEmbeddingService:
    @staticmethod
    async def generate_query_embedding(_text: str) -> list[float]:
        return [1.0]

    @staticmethod
    def cosine_similarity(_vec1: list[float], vec2: list[float]) -> float:
        return float(vec2[0])


@pytest.fixture
def retriever() -> KnowledgeRetriever:
    retriever = KnowledgeRetriever()
    retriever.embedding_service = FakeEmbeddingService()  # type: ignore[assignment]
    return retriever


def _patch_find(
    monkeypatch: pytest.MonkeyPatch, model: type, docs: list[object]
) -> None:
    monkeypatch.setattr(
        model, "find", staticmethod(lambda *args, **kwargs: FakeFindQuery(docs))
    )


def _build_document(model: Any, **kwargs: object) -> object:
    return model.model_construct(**kwargs)


@pytest.mark.asyncio
async def test_search_lessons_prefers_recent_profitable_example(
    monkeypatch: pytest.MonkeyPatch,
    retriever: KnowledgeRetriever,
) -> None:
    now = datetime.now(UTC)
    lessons = [
        _build_document(
            TradeLesson,
            symbol="BTC-USDT",
            side=TradeSide.BUY,
            outcome=TradeOutcome.PROFIT,
            profit_pct=4.0,
            lesson_summary="Recent breakout trade with disciplined risk.",
            market_context={"trend": "bullish"},
            entry_price=100,
            exit_price=104,
            embedding=[0.76],
            created_at=now - timedelta(days=1),
        ),
        _build_document(
            TradeLesson,
            symbol="BTC-USDT",
            side=TradeSide.BUY,
            outcome=TradeOutcome.PROFIT,
            profit_pct=1.0,
            lesson_summary="Older generic trade note.",
            market_context={"trend": "bullish"},
            entry_price=100,
            exit_price=101,
            embedding=[0.82],
            created_at=now - timedelta(days=120),
        ),
    ]
    _patch_find(monkeypatch, TradeLesson, lessons)

    results = await retriever.search_lessons(
        "btc breakout setup", symbol="BTC-USDT", limit=2
    )

    assert [lesson.lesson_summary for lesson in results] == [
        "Recent breakout trade with disciplined risk.",
        "Older generic trade note.",
    ]


@pytest.mark.asyncio
async def test_search_patterns_prefers_validated_high_sample_match(
    monkeypatch: pytest.MonkeyPatch,
    retriever: KnowledgeRetriever,
) -> None:
    now = datetime.now(UTC)
    patterns = [
        _build_document(
            TradingPattern,
            pattern_name="Validated Breakout",
            pattern_type="technical",
            description="Breakout continuation with strong follow-through.",
            conditions={"breakout": True},
            success_rate=68,
            sample_count=80,
            avg_return=2.8,
            symbols=["BTC-USDT"],
            timeframes=["1H"],
            embedding=[0.78],
            created_at=now - timedelta(days=40),
            last_validated=now - timedelta(days=1),
        ),
        _build_document(
            TradingPattern,
            pattern_name="Stale Breakout",
            pattern_type="technical",
            description="Older breakout pattern with weak support.",
            conditions={"breakout": True},
            success_rate=52,
            sample_count=5,
            avg_return=1.0,
            symbols=["ETH-USDT"],
            timeframes=["4H"],
            embedding=[0.84],
            created_at=now - timedelta(days=220),
            last_validated=now - timedelta(days=180),
        ),
    ]
    _patch_find(monkeypatch, TradingPattern, patterns)

    results = await retriever.search_patterns(
        "btc breakout continuation",
        symbol="BTC-USDT",
        timeframes=["1H"],
        limit=2,
    )

    assert [pattern.pattern_name for pattern in results] == [
        "Validated Breakout",
        "Stale Breakout",
    ]


@pytest.mark.asyncio
async def test_search_strategies_prefers_matching_timeframe_and_regime(
    monkeypatch: pytest.MonkeyPatch,
    retriever: KnowledgeRetriever,
) -> None:
    now = datetime.now(UTC)
    strategies = [
        _build_document(
            StrategyKnowledge,
            name="1H Breakout Trend",
            description="Trade breakout continuation on liquid majors.",
            entry_rules={"trigger": "breakout"},
            exit_rules={"target": "2R"},
            risk_params={"stop_loss": "below breakout"},
            win_rate=65,
            sharpe_ratio=1.8,
            timeframes=["1H"],
            market_conditions=["breakout", "bullish"],
            embedding=[0.79],
            created_at=now - timedelta(days=20),
            updated_at=now - timedelta(days=2),
        ),
        _build_document(
            StrategyKnowledge,
            name="Generic Momentum",
            description="General momentum strategy.",
            entry_rules={"trigger": "momentum"},
            exit_rules={"target": "trail"},
            risk_params={"stop_loss": "wide"},
            embedding=[0.85],
            created_at=now - timedelta(days=400),
            updated_at=now - timedelta(days=300),
        ),
    ]
    _patch_find(monkeypatch, StrategyKnowledge, strategies)

    results = await retriever.search_strategies(
        "breakout trend continuation",
        timeframes=["1H"],
        market_conditions=["bullish", "breakout"],
        limit=2,
    )

    assert [strategy.name for strategy in results] == [
        "1H Breakout Trend",
        "Generic Momentum",
    ]


@pytest.mark.asyncio
async def test_get_relevant_context_formats_trading_metadata(
    monkeypatch: pytest.MonkeyPatch,
    retriever: KnowledgeRetriever,
) -> None:
    now = datetime.now(UTC)
    strategy = _build_document(
        StrategyKnowledge,
        name="Breakout Strategy",
        description="A" * 220,
        entry_rules={"trigger": "breakout"},
        exit_rules={"target": "2R"},
        risk_params={"stop_loss": "1 ATR", "size": "1% risk"},
        win_rate=61,
        timeframes=["1H"],
        market_conditions=["breakout"],
        created_at=now - timedelta(days=60),
        updated_at=now - timedelta(days=4),
    )
    lesson = _build_document(
        TradeLesson,
        symbol="BTC-USDT",
        side=TradeSide.BUY,
        outcome=TradeOutcome.PROFIT,
        profit_pct=3.5,
        lesson_summary="B" * 220,
        market_context={"trend": "bullish"},
        recommendations=["Scale in only after confirmation."],
        entry_price=100,
        exit_price=103.5,
        created_at=now - timedelta(days=3),
    )
    pattern = _build_document(
        TradingPattern,
        pattern_name="Breakout Pattern",
        pattern_type="technical",
        description="C" * 220,
        conditions={"breakout": True},
        success_rate=67,
        sample_count=42,
        avg_return=2.4,
        symbols=["BTC-USDT"],
        timeframes=["1H"],
        created_at=now - timedelta(days=50),
        last_validated=now - timedelta(days=5),
    )

    async def fake_search_all(*_args, **_kwargs) -> dict[str, list[object]]:
        return {
            "strategies": [strategy],
            "lessons": [lesson],
            "patterns": [pattern],
        }

    monkeypatch.setattr(retriever, "search_all", fake_search_all)

    context = await retriever.get_relevant_context(
        "btc breakout setup",
        symbol="BTC-USDT",
        timeframes=["1H"],
    )

    assert "## Relevant Strategies" in context
    assert "win rate: 61%" in context
    assert "timeframes: 1H" in context
    assert "takeaway: Scale in only after confirmation." in context
    assert "validated: 5 days ago" in context
    assert "A" * 170 not in context
    assert len(context) < 1200


def test_build_knowledge_query_uses_task_context() -> None:
    scheduler = AgentTaskScheduler()
    task = AgentTask.model_construct(
        user_id="507f1f77bcf86cd799439011",
        name="Breakout Hunter",
        description="Focus on bullish breakout continuation setups.",
        symbols=["BTC-USDT"],
        risk_level=RiskLevel.MODERATE,
        custom_instructions="Prefer momentum trades and avoid ranging conditions.",
        monitoring_conditions=[
            MonitoringCondition(
                condition_type=MonitoringConditionType.RSI_ABOVE,
                threshold=60,
                timeframe="4H",
                description="Watch for breakout continuation during bullish trend.",
            )
        ],
    )

    query = scheduler._build_knowledge_query("BTC-USDT", task)

    assert query != "BTC-USDT trading"
    assert "Trading symbol: BTC-USDT" in query
    assert "Risk level: moderate" in query
    assert "Relevant timeframes: 4H" in query
    assert (
        "Market conditions of interest: bullish, breakout, trend, ranging, momentum"
        in query
    )
