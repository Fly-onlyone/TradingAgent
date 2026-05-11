"""Tests for agent session helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from app.api.v1.agent_sessions import get_date_label
from app.db.models.agent_session import MessageRole, SessionMessage, _normalize_delegation_messages


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


def test_normalize_delegation_messages_replaces_running_card_in_place() -> None:
    started_at = datetime(2026, 4, 18, 8, 0, tzinfo=UTC)
    finished_at = datetime(2026, 4, 18, 8, 5, tzinfo=UTC)

    running = SessionMessage(
        role=MessageRole.ASSISTANT,
        content="Extracting from: Example Strategy",
        timestamp=started_at,
        tool_calls=[
            {
                "name": "delegate_to_extractor",
                "arguments": {
                    "article_url": "https://example.com/strategy",
                    "article_title": "Example Strategy",
                },
                "result": {
                    "session_id": "child-1",
                    "status": "running",
                },
            }
        ],
    )
    failed = SessionMessage(
        role=MessageRole.ASSISTANT,
        content="Extraction failed for 'Example Strategy': missing_name",
        timestamp=finished_at,
        tool_calls=[
            {
                "name": "delegate_to_extractor",
                "arguments": {
                    "article_url": "https://example.com/strategy",
                    "article_title": "Example Strategy",
                },
                "result": {
                    "session_id": "child-1",
                    "status": "failed",
                },
            }
        ],
    )

    normalized = _normalize_delegation_messages([running, failed])

    assert len(normalized) == 1
    assert normalized[0].content == failed.content
    assert normalized[0].timestamp == started_at
    assert normalized[0].tool_calls[0]["result"]["status"] == "failed"
