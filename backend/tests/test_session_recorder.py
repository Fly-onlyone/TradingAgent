"""Tests for `AgentSessionRecorder.record_delegation` payload shape.

The recorder's other methods (user/assistant message persistence) require a
live Beanie session so they're exercised via integration tests. This unit
test guards the synthetic `delegate_to_extractor` tool_call message shape,
which the frontend `ToolCallBlock` renders as a clickable card.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from app.agent.session_recorder import DELEGATE_TOOL_NAME, AgentSessionRecorder
from beanie import PydanticObjectId


class _FakeSession:
    id = PydanticObjectId()
    user_id = PydanticObjectId()
    title = None

    async def save(self) -> None:
        pass

    def record_message(self, *_args, **_kwargs) -> None:
        pass

    def build_message_title(self, content: str) -> str:  # pragma: no cover
        return content[:50]

    def end_session(self) -> None:  # pragma: no cover
        pass


@pytest.mark.asyncio
async def test_record_delegation_emits_tool_call_with_session_id() -> None:
    child_id = PydanticObjectId()
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    with patch(
        "app.agent.session_recorder.persist_session_message",
        new=AsyncMock(return_value=None),
    ) as mock_persist:
        tool_call_id = await recorder.record_delegation(
            child_session_id=child_id,
            article_url="https://example.com/article",
            article_title="RSI Reversal Strategy",
            status="running",
            detail="Kicking off extraction",
        )

    assert isinstance(tool_call_id, str) and tool_call_id
    mock_persist.assert_awaited_once()

    kwargs = mock_persist.await_args.kwargs
    assert kwargs["role"] == "assistant"
    tool_calls = kwargs["tool_calls"]
    assert len(tool_calls) == 1
    tc = tool_calls[0]
    assert tc["name"] == DELEGATE_TOOL_NAME
    assert tc["arguments"]["article_title"] == "RSI Reversal Strategy"
    assert tc["result"]["session_id"] == str(child_id)
    assert tc["result"]["status"] == "running"


@pytest.mark.asyncio
async def test_record_delegation_handles_missing_child_session() -> None:
    """Fetch-failed case: no child session exists; card should show no link."""
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    with patch(
        "app.agent.session_recorder.persist_session_message",
        new=AsyncMock(return_value=None),
    ) as mock_persist:
        await recorder.record_delegation(
            child_session_id=None,
            article_url="https://example.com/article",
            article_title="Broken URL",
            status="failed",
        )

    kwargs = mock_persist.await_args.kwargs
    tc = kwargs["tool_calls"][0]
    assert tc["result"]["session_id"] is None
    assert tc["result"]["status"] == "failed"


@pytest.mark.asyncio
async def test_update_delegation_status_writes_separate_message() -> None:
    """Status transitions are append-only — confirms orchestrator contract."""
    child_id = PydanticObjectId()
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    with patch(
        "app.agent.session_recorder.persist_session_message",
        new=AsyncMock(return_value=None),
    ) as mock_persist:
        await recorder.record_delegation(
            child_session_id=child_id,
            article_url="https://x",
            article_title="t",
            status="running",
        )
        await recorder.update_delegation_status(
            child_session_id=child_id,
            article_url="https://x",
            article_title="t",
            status="ok",
            detail="Saved",
        )

    assert mock_persist.await_count == 2
    statuses = [
        call.kwargs["tool_calls"][0]["result"]["status"] for call in mock_persist.await_args_list
    ]
    assert statuses == ["running", "ok"]
