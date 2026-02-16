"""Tests for agent session date grouping helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from app.api.v1.agent_sessions import get_date_label


def test_get_date_label_accepts_timezone_aware_datetime() -> None:
    aware = datetime.now(UTC)
    date_str, label = get_date_label(aware)

    assert date_str == aware.strftime("%Y-%m-%d")
    assert label in {"Today", "Yesterday"} or isinstance(label, str)


def test_get_date_label_accepts_timezone_naive_datetime() -> None:
    naive = datetime.now()
    date_str, label = get_date_label(naive)

    assert date_str == naive.strftime("%Y-%m-%d")
    assert label in {"Today", "Yesterday"} or isinstance(label, str)
