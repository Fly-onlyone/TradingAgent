"""Tests for `StrategyExtractorAgent` static helpers (no Claude / DB)."""

from __future__ import annotations

from app.agent.subagents.strategy_extractor_agent import StrategyExtractorAgent
from app.services.strategy_extractor import ExtractedStrategy


def test_validate_rejects_placeholder_name() -> None:
    bad = ExtractedStrategy(
        name="Imported Strategy",
        description="d",
        entry_rules={"k": "v"},
    )
    assert StrategyExtractorAgent._validate(bad) == "missing_name"


def test_validate_rejects_empty_entry_rules() -> None:
    bad = ExtractedStrategy(name="Name", description="d", entry_rules={})
    assert StrategyExtractorAgent._validate(bad) == "missing_entry_rules"


def test_validate_accepts_complete_strategy() -> None:
    good = ExtractedStrategy(
        name="RSI Reversal",
        description="desc",
        entry_rules={"rsi": "< 30"},
        exit_rules={"rsi": "> 70"},
    )
    assert StrategyExtractorAgent._validate(good) is None


def test_confidence_rewards_filled_fields() -> None:
    bare = ExtractedStrategy(name="X", description="")
    rich = ExtractedStrategy(
        name="Rich",
        description="A detailed description of a complete strategy that describes edge.",
        entry_rules={"rsi": "< 30"},
        exit_rules={"tp": "5%"},
        risk_params={"size": "1%"},
        timeframes=["1H"],
        symbols=["BTC-USDT"],
        market_conditions=["trending"],
    )

    assert StrategyExtractorAgent._score_confidence(bare) < 0.5
    assert StrategyExtractorAgent._score_confidence(rich) >= 0.9
