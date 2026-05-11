"""Persist subagent conversation streams into AgentSession for UI playback.

Subagents (Explorer, Extractor) use this to stream their Claude SDK
responses into the same AgentSession / AgentSessionMessage collections
that the main chat viewer already reads, so users can navigate them
exactly like task runs.
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
)

from app.agent.constants import agent_channel_user_id
from app.db.models.agent_session import (
    AgentSession,
    AgentSessionMessage,
    SessionKind,
    persist_session_message,
    persist_session_message_doc,
)

logger = logging.getLogger(__name__)

# Synthetic tool name used to render a "this subagent spawned another subagent"
# card in the parent explorer chat. The frontend ToolCallBlock renders this
# with a custom card + "Open extractor session" button.
DELEGATE_TOOL_NAME = "delegate_to_extractor"


def _delegation_tool_call(
    *,
    tool_call_id: str,
    child_session_id: PydanticObjectId | None,
    article_url: str,
    article_title: str,
    status: str,
) -> dict:
    return {
        "id": tool_call_id,
        "name": DELEGATE_TOOL_NAME,
        "arguments": {
            "article_url": article_url,
            "article_title": article_title,
        },
        "result": {
            "session_id": str(child_session_id) if child_session_id else None,
            "article_url": article_url,
            "article_title": article_title,
            "status": status,
        },
        "resultSummary": f"status: {status}",
    }


async def broadcast_assistant_message(
    session: AgentSession,
    *,
    role: str,
    content: str,
    tool_calls: list[dict] | None,
    thinking_content: str | None,
    keep_running: bool = False,
    message_id: str | None = None,
) -> None:
    """Push a live `message` event to the user's agent WebSocket.

    `keep_running=True` tells the frontend this is an intermediate message
    in a multi-message run (like a discovery cycle's delegation updates),
    so the sidebar's "active session" spinner should stay on. The final
    message of the run omits the flag so the spinner clears naturally.

    `message_id` is the backing `AgentSessionMessage._id` when known —
    frontend uses it to address the bubble for later in-place updates.
    """
    try:
        from app.api.websocket.connection_manager import manager
    except Exception:  # pragma: no cover — import guard for offline tools
        return

    payload: dict = {
        "type": "message",
        "session_id": str(session.id),
        "data": {
            "id": message_id or str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": int(datetime.now(UTC).timestamp() * 1000),
            "toolCalls": tool_calls,
            "thinkingContent": thinking_content,
        },
    }
    if keep_running:
        payload["keep_running"] = True
    try:
        await manager.send_to_user(agent_channel_user_id(session.user_id), payload)
    except Exception:
        logger.debug("Subagent broadcast failed", exc_info=True)


async def broadcast_message_updated(
    session: AgentSession,
    *,
    message_id: str,
    content: str,
    tool_calls: list[dict] | None,
    keep_running: bool = False,
) -> None:
    """Push a `message_updated` event so the frontend replaces an existing bubble.

    Used by `update_delegation_status` to morph the "running" delegation
    card into "saved" / "failed" / etc. without adding a second bubble.
    """
    try:
        from app.api.websocket.connection_manager import manager
    except Exception:  # pragma: no cover
        return

    payload: dict = {
        "type": "message_updated",
        "session_id": str(session.id),
        "data": {
            "id": message_id,
            "content": content,
            "toolCalls": tool_calls,
        },
    }
    if keep_running:
        payload["keep_running"] = True
    try:
        await manager.send_to_user(agent_channel_user_id(session.user_id), payload)
    except Exception:
        logger.debug("Subagent message_updated broadcast failed", exc_info=True)


async def broadcast_thinking(session: AgentSession, *, thinking: bool) -> None:
    """Drive the "thinking..." spinner in the chat UI for subagent turns."""
    try:
        from app.api.websocket.connection_manager import manager
    except Exception:  # pragma: no cover
        return
    payload = {
        "type": "thinking" if thinking else "message",
        "session_id": str(session.id),
        "data": {} if thinking else {},
    }
    # We don't have a "stop-thinking" event in the wire protocol — the
    # frontend clears the spinner when a `message` event arrives. So only
    # emit a `thinking: true` tick here; spinner is implicitly cleared by
    # the next `broadcast_assistant_message`.
    if thinking:
        try:
            await manager.send_to_user(agent_channel_user_id(session.user_id), payload)
        except Exception:
            logger.debug("Subagent thinking broadcast failed", exc_info=True)


async def create_subagent_session(
    *,
    user_id: PydanticObjectId,
    title: str,
    description: str | None = None,
) -> AgentSession:
    """Create a fresh AgentSession for a subagent run and insert it."""
    session = AgentSession(
        user_id=user_id,
        session_kind=SessionKind.SUBAGENT,
        title=title,
        description=description,
        is_active=True,
    )
    await session.insert()
    return session


class AgentSessionRecorder:
    """Persist a Claude SDK stream (one turn at a time) into an AgentSession.

    Collects text + tool_use + thinking blocks during a stream, then flushes
    a single assistant message with all of them at turn end — mirroring how
    the main `agent` WebSocket route persists turns.
    """

    def __init__(self, session: AgentSession) -> None:
        self.session = session
        self._text_parts: list[str] = []
        self._thinking_parts: list[str] = []
        self._tool_calls: list[dict] = []
        self._tokens = 0

    # ------------------------------------------------------------------
    # User / system inputs
    # ------------------------------------------------------------------

    async def record_user_message(self, content: str) -> None:
        """Persist the user prompt that kicked off this turn."""
        await persist_session_message(self.session, role="user", content=content)
        await self.session.save()
        await broadcast_assistant_message(
            self.session,
            role="user",
            content=content,
            tool_calls=None,
            thinking_content=None,
        )
        await broadcast_thinking(self.session, thinking=True)

    async def record_system_note(self, content: str) -> None:
        """Persist a system message (e.g. 'Loaded article, starting extraction')."""
        await persist_session_message(self.session, role="system", content=content)
        await self.session.save()
        await broadcast_assistant_message(
            self.session,
            role="system",
            content=content,
            tool_calls=None,
            thinking_content=None,
        )

    # ------------------------------------------------------------------
    # Streaming an SDK turn
    # ------------------------------------------------------------------

    def _reset_turn(self) -> None:
        self._text_parts = []
        self._thinking_parts = []
        self._tool_calls = []
        self._tokens = 0

    async def stream_turn(self, client: ClaudeSDKClient) -> str:
        """Iterate `client.receive_response()` and persist one assistant message.

        Returns the joined assistant text so callers can parse it (e.g. JSON
        for subscription-mode extractors).
        """
        self._reset_turn()
        try:
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in getattr(message, "content", []):
                        if isinstance(block, TextBlock):
                            self._text_parts.append(block.text)
                        elif isinstance(block, ThinkingBlock):
                            self._thinking_parts.append(getattr(block, "thinking", "") or "")
                        elif isinstance(block, ToolUseBlock):
                            self._tool_calls.append(
                                {
                                    "id": getattr(block, "id", str(uuid.uuid4())),
                                    "name": getattr(block, "name", "unknown"),
                                    "arguments": getattr(block, "input", {}) or {},
                                }
                            )
                elif isinstance(message, ResultMessage):
                    usage = getattr(message, "usage", None)
                    if usage is not None:
                        self._tokens = int(getattr(usage, "input_tokens", 0) or 0) + int(
                            getattr(usage, "output_tokens", 0) or 0
                        )
        finally:
            await self._flush_assistant_turn()
        return "".join(self._text_parts)

    async def _flush_assistant_turn(self) -> None:
        content = "".join(self._text_parts).strip()
        if not content and not self._tool_calls:
            return

        tool_calls = self._tool_calls or None
        thinking = "".join(self._thinking_parts).strip() or None
        final_content = content or "(tool use only)"

        await persist_session_message(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
            thinking_content=thinking,
            tokens=self._tokens,
        )
        await self.session.save()
        await broadcast_assistant_message(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
            thinking_content=thinking,
            # If this turn used tools, more turns are coming — tell the
            # frontend the session run is still active.
            keep_running=bool(tool_calls),
        )

    # ------------------------------------------------------------------
    # Tool-result attachment (post-hoc, for MCP tools that we execute
    # out-of-band — Explorer tools run inside the SDK so their results
    # flow back through ToolUseBlock; nothing to do here.)
    # ------------------------------------------------------------------

    async def attach_tool_result(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        result: Any,
        *,
        summary: str | None = None,
    ) -> None:
        """Write a follow-up assistant message describing a tool result.

        Used by the orchestrator to render completion of subagent delegations
        (see `record_delegation`). Writes a message with a single tool_call
        dict so the frontend's ToolCallBlock picks it up.
        """
        tool_calls = [
            {
                "id": str(uuid.uuid4()),
                "name": tool_name,
                "arguments": tool_input,
                "result": result,
                "resultSummary": summary,
            }
        ]
        final_content = summary or f"Tool {tool_name} completed"
        await persist_session_message(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
        )
        await self.session.save()
        await broadcast_assistant_message(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
            thinking_content=None,
        )

    # ------------------------------------------------------------------
    # Parent-chat delegation card (renders in the Explorer's session)
    # ------------------------------------------------------------------

    async def record_delegation(
        self,
        *,
        child_session_id: PydanticObjectId | None,
        article_url: str,
        article_title: str,
        status: str = "running",
        detail: str | None = None,
    ) -> str:
        """Insert a `delegate_to_extractor` card and return the message id.

        Pass the returned id to `update_delegation_status()` when the
        extractor completes — the card will transition "running" → "saved"
        in place instead of adding a second bubble.
        """
        tool_call_id = str(uuid.uuid4())
        tool_calls = [
            _delegation_tool_call(
                tool_call_id=tool_call_id,
                child_session_id=child_session_id,
                article_url=article_url,
                article_title=article_title,
                status=status,
            )
        ]
        final_content = detail or f"Delegating extraction: {article_title}"
        document = await persist_session_message_doc(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
        )
        await self.session.save()
        message_id = str(document.id)
        await broadcast_assistant_message(
            self.session,
            role="assistant",
            content=final_content,
            tool_calls=tool_calls,
            thinking_content=None,
            keep_running=True,
            message_id=message_id,
        )
        return message_id

    async def update_delegation_status(
        self,
        *,
        message_id: str,
        child_session_id: PydanticObjectId | None,
        article_url: str,
        article_title: str,
        status: str,
        detail: str | None = None,
        keep_thinking: bool = True,
        keep_running: bool = True,
    ) -> None:
        """Mutate the existing delegation card's DB row in place.

        Frontend receives a `message_updated` WS event and replaces the
        matching bubble's content + tool_calls, so the user sees a single
        card transition from "running" to "saved/failed/skipped" — no
        duplicate bubble.

        `keep_thinking`: broadcast `thinking=true` after the update so the
        chat pill stays while siblings finish.
        `keep_running`: marks the run as still active for the sidebar spinner.
        """
        tool_calls = [
            _delegation_tool_call(
                tool_call_id=str(uuid.uuid4()),
                child_session_id=child_session_id,
                article_url=article_url,
                article_title=article_title,
                status=status,
            )
        ]
        final_content = detail or f"Extraction {status}: {article_title}"

        # Mutate the existing message document in place.
        try:
            object_id = PydanticObjectId(message_id)
        except Exception:
            logger.debug("Bad message_id passed to update_delegation_status: %s", message_id)
            return

        doc = await AgentSessionMessage.get(object_id)
        if doc is None:
            logger.debug(
                "update_delegation_status: message %s not found (session %s)",
                message_id,
                self.session.id,
            )
            return
        doc.content = final_content
        doc.tool_calls = tool_calls
        await doc.save()

        await broadcast_message_updated(
            self.session,
            message_id=message_id,
            content=final_content,
            tool_calls=tool_calls,
            keep_running=keep_running,
        )
        if keep_thinking:
            await broadcast_thinking(self.session, thinking=True)

    async def record_summary(self, content: str) -> None:
        """Persist a final summary assistant message + broadcast (no thinking)."""
        await persist_session_message(
            self.session,
            role="assistant",
            content=content,
        )
        await self.session.save()
        await broadcast_assistant_message(
            self.session,
            role="assistant",
            content=content,
            tool_calls=None,
            thinking_content=None,
        )

    async def end(self) -> None:
        """Mark the session complete."""
        self.session.end_session()
        await self.session.save()
