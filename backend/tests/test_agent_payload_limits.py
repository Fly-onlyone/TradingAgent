"""Tests for bounded agent payload retention."""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest
from beanie import PydanticObjectId

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("SENTRY_DSN", "")

from app.agent import trading_agent
from app.api.websocket import agent as websocket_agent
from app.db.models import agent_session


def _build_session() -> agent_session.AgentSession:
    return agent_session.AgentSession.model_construct(
        id=PydanticObjectId(),
        user_id=PydanticObjectId(),
        messages=[],
        active_pending_question=None,
        total_messages=0,
        user_messages=0,
        assistant_messages=0,
        decisions_made=0,
        trades_executed=0,
        total_tokens=0,
        symbols_discussed=[],
        is_active=True,
        started_at=datetime.now(UTC),
        ended_at=None,
        last_message_at=None,
        title=None,
        description=None,
        sdk_session_id=None,
    )


def test_append_bounded_text_truncates_once() -> None:
    limit = 12

    bounded = trading_agent._append_bounded_text("", "abcdefghijklmno", limit=limit)
    bounded = trading_agent._append_bounded_text(bounded, "more text", limit=limit)

    assert bounded.endswith(trading_agent._TRUNCATION_MARKER)
    assert bounded.count(trading_agent._TRUNCATION_MARKER) == 1


def test_truncate_tool_argument_limits_nested_values() -> None:
    value = {
        "long": "x" * 500,
        "items": list(range(20)),
        "nested": {"message": "y" * 500},
    }

    truncated = trading_agent._truncate_tool_argument(value)

    assert truncated["long"].endswith(trading_agent._TRUNCATION_MARKER)
    assert len(truncated["items"]) == trading_agent._MAX_TOOL_ARGUMENT_LIST_ITEMS
    assert truncated["nested"]["message"].endswith(trading_agent._TRUNCATION_MARKER)


def test_truncate_text_limits_persisted_thinking_content() -> None:
    text = "a" * (websocket_agent._PERSISTED_THINKING_CHAR_LIMIT + 100)

    truncated = websocket_agent._truncate_text(
        text,
        limit=websocket_agent._PERSISTED_THINKING_CHAR_LIMIT,
    )

    assert truncated is not None
    assert truncated.endswith("...[truncated]")


def test_trim_tool_calls_caps_history_payload() -> None:
    tool_calls = [{"id": str(i), "name": "tool", "arguments": {"value": i}} for i in range(40)]

    trimmed = websocket_agent._trim_tool_calls(tool_calls)

    assert len(trimmed) == websocket_agent._PERSISTED_TOOL_CALL_LIMIT
    assert trimmed[0]["id"] == "0"


@pytest.mark.asyncio
async def test_persist_session_message_sets_title_without_embedded_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_docs: list[object] = []

    class _InsertedDocument:
        async def insert(self) -> None:
            inserted_docs.append(self)

    def fake_from_session_message(**_: object) -> _InsertedDocument:
        return _InsertedDocument()

    monkeypatch.setattr(
        agent_session.AgentSessionMessage,
        "from_session_message",
        staticmethod(fake_from_session_message),
    )

    session = _build_session()

    await agent_session.persist_session_message(
        session,
        role="user",
        content="Review BTC market structure and trading setup for today",
    )

    assert inserted_docs
    assert session.title == "Review BTC market structure and trading setup for ..."
    assert session.total_messages == 1
    assert session.user_messages == 1


@pytest.mark.asyncio
async def test_build_resume_history_reads_from_persisted_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _build_session()

    async def fake_fetch_session_messages(
        _: agent_session.AgentSession,
        *,
        skip: int = 0,
        limit: int | None = None,
    ) -> tuple[list[agent_session.SessionMessage], int]:
        assert skip == 0
        assert limit is None
        messages = [
            agent_session.SessionMessage(role="user", content="First question"),
            agent_session.SessionMessage(role="assistant", content="First answer"),
            agent_session.SessionMessage(role="user", content="Current message"),
        ]
        return messages, len(messages)

    monkeypatch.setattr(websocket_agent, "fetch_session_messages", fake_fetch_session_messages)

    history = await websocket_agent._build_resume_history(session)

    assert history is not None
    assert "User: First question" in history
    assert "Assistant: First answer" in history
    assert "Current message" not in history
