"""Tests for `strategy_dedup.merge_extractions`."""

from __future__ import annotations

from app.services.strategy_dedup import ExtractionEvidence, merge_extractions
from app.services.strategy_extractor import ExtractedStrategy
from beanie import PydanticObjectId


def _ev(
    name: str,
    entry: dict | None = None,
    exit_: dict | None = None,
    confidence: float = 0.8,
    url: str = "https://example.com/a",
) -> ExtractionEvidence:
    return ExtractionEvidence(
        extracted=ExtractedStrategy(
            name=name,
            description="desc",
            entry_rules=entry or {"rsi": "below 30"},
            exit_rules=exit_ or {"rsi": "above 70"},
        ),
        confidence=confidence,
        source_url=url,
        source_session_id=PydanticObjectId(),
        article_title=name,
    )


def test_merge_groups_by_normalized_name() -> None:
    rsi_entry = {"rsi": "< 30"}
    rsi_exit = {"rsi": "> 70"}
    a = _ev("RSI Reversal", entry=rsi_entry, exit_=rsi_exit, url="https://a.example/x")
    b = _ev("  rsi reversal ", entry=rsi_entry, exit_=rsi_exit, url="https://b.example/y")
    c = _ev(
        "Breakout",
        entry={"price": "> 20MA"},
        exit_={"price": "< 20MA"},
        url="https://c.example/z",
    )

    merged = merge_extractions([a, b, c])

    assert len(merged) == 2
    rsi_bucket = next(m for m in merged if "rsi" in m.extracted.name.lower())
    assert sorted(rsi_bucket.source_urls) == [
        "https://a.example/x",
        "https://b.example/y",
    ]


def test_merge_groups_by_rules_fingerprint_when_names_differ() -> None:
    entry = {"rsi": "BELOW 30"}
    exit_ = {"tp": "5%"}
    a = _ev("Name-A", entry=entry, exit_=exit_, url="https://a/")
    b = _ev("Completely Different Name", entry=entry, exit_=exit_, url="https://b/")

    merged = merge_extractions([a, b])

    assert len(merged) == 1
    assert sorted(merged[0].source_urls) == ["https://a/", "https://b/"]


def test_merge_preserves_max_confidence() -> None:
    a = _ev("Same", confidence=0.5, url="https://a/")
    b = _ev("Same", confidence=0.9, url="https://b/")

    merged = merge_extractions([a, b])

    assert len(merged) == 1
    assert merged[0].confidence == 0.9


def test_merge_deduplicates_session_ids_and_urls() -> None:
    session_id = PydanticObjectId()
    url = "https://same.example/x"

    a = ExtractionEvidence(
        extracted=ExtractedStrategy(
            name="S",
            description="d",
            entry_rules={"k": "v"},
            exit_rules={"k": "v"},
        ),
        confidence=0.7,
        source_url=url,
        source_session_id=session_id,
    )
    b = ExtractionEvidence(
        extracted=ExtractedStrategy(
            name="S",
            description="d",
            entry_rules={"k": "v"},
            exit_rules={"k": "v"},
        ),
        confidence=0.8,
        source_url=url,
        source_session_id=session_id,
    )

    merged = merge_extractions([a, b])
    assert merged[0].source_urls == [url]
    assert merged[0].source_session_ids == [session_id]
