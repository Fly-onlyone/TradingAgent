"""Tests for `StrategyExplorerAgent._parse_candidates`."""

from __future__ import annotations

from app.agent.subagents.strategy_explorer import StrategyExplorerAgent


def test_parse_candidates_returns_empty_on_missing_key() -> None:
    assert StrategyExplorerAgent._parse_candidates({}) == []


def test_parse_candidates_drops_items_without_url() -> None:
    out = StrategyExplorerAgent._parse_candidates(
        {
            "candidates": [
                {"url": "https://a/", "title": "A"},
                {"title": "no url"},
                {"url": "", "title": "blank url"},
            ]
        }
    )
    assert [c.url for c in out] == ["https://a/"]


def test_parse_candidates_accepts_json_string_input() -> None:
    raw = '[{"url": "https://x/", "title": "X", "reason": "y"}]'
    out = StrategyExplorerAgent._parse_candidates({"candidates": raw})
    assert len(out) == 1
    assert out[0].url == "https://x/"
    assert out[0].reason == "y"


def test_parse_candidates_uses_url_as_fallback_title() -> None:
    out = StrategyExplorerAgent._parse_candidates({"candidates": [{"url": "https://u/"}]})
    assert out[0].title == "https://u/"
