"""Tests for `AgentSessionRecorder` delegation flow.

Guards the synthetic `delegate_to_extractor` tool_call message shape and
the in-place mutation contract used by Option B (one bubble per article
that transitions running → saved).
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


def _fake_inserted_doc(message_id: PydanticObjectId) -> object:
    """Returned by the mocked `persist_session_message_doc` call."""

    class _Doc:
        id = message_id
        content = ""
        tool_calls: list[dict] = []

        async def save(self) -> None:
            pass

    return _Doc()


@pytest.mark.asyncio
async def test_record_delegation_emits_tool_call_with_session_id() -> None:
    child_id = PydanticObjectId()
    message_id = PydanticObjectId()
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    with patch(
        "app.agent.session_recorder.persist_session_message_doc",
        new=AsyncMock(return_value=_fake_inserted_doc(message_id)),
    ) as mock_persist:
        returned_id = await recorder.record_delegation(
            child_session_id=child_id,
            article_url="https://example.com/article",
            article_title="RSI Reversal Strategy",
            status="running",
            detail="Kicking off extraction",
        )

    assert returned_id == str(message_id)
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
    message_id = PydanticObjectId()
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    with patch(
        "app.agent.session_recorder.persist_session_message_doc",
        new=AsyncMock(return_value=_fake_inserted_doc(message_id)),
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
async def test_update_delegation_status_mutates_existing_message() -> None:
    """Option B: status updates mutate the existing row in place, no new message."""
    child_id = PydanticObjectId()
    message_id = PydanticObjectId()
    session = _FakeSession()
    recorder = AgentSessionRecorder(session)  # type: ignore[arg-type]

    mock_doc = _fake_inserted_doc(message_id)

    async def fake_get(_id: PydanticObjectId) -> object:
        return mock_doc

    with (
        patch(
            "app.agent.session_recorder.persist_session_message_doc",
            new=AsyncMock(return_value=mock_doc),
        ) as mock_persist,
        patch(
            "app.agent.session_recorder.AgentSessionMessage.get",
            new=AsyncMock(side_effect=fake_get),
        ) as mock_get,
        patch(
            "app.agent.session_recorder.broadcast_message_updated",
            new=AsyncMock(return_value=None),
        ) as mock_update_broadcast,
    ):
        mid = await recorder.record_delegation(
            child_session_id=child_id,
            article_url="https://x",
            article_title="t",
            status="running",
        )
        await recorder.update_delegation_status(
            message_id=mid,
            child_session_id=child_id,
            article_url="https://x",
            article_title="t",
            status="ok",
            detail="Saved",
        )

    # Only ONE new insert — the running message. The "ok" update mutates in place.
    assert mock_persist.await_count == 1
    mock_get.assert_awaited_once_with(message_id)
    assert mock_doc.tool_calls[0]["result"]["status"] == "ok"
    assert mock_doc.content == "Saved"
    # Update broadcast carries the new status so the frontend can replace the bubble.
    mock_update_broadcast.assert_awaited_once()
    broadcast_kwargs = mock_update_broadcast.await_args.kwargs
    assert broadcast_kwargs["message_id"] == str(message_id)
    assert broadcast_kwargs["tool_calls"][0]["result"]["status"] == "ok"
