"""Persist subagent conversation streams into AgentSession for UI playback.

Subagents (Explorer, Extractor) use this to stream their Claude SDK
responses into the same AgentSession / AgentSessionMessage collections
that the main chat viewer already reads, so users can navigate them
exactly like task runs.
"""

import logging
import uuid
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

from app.db.models.agent_session import AgentSession, persist_session_message

logger = logging.getLogger(__name__)

# Synthetic tool name used to render a "this subagent spawned another subagent"
# card in the parent explorer chat. The frontend ToolCallBlock renders this
# with a custom card + "Open extractor session" button.
DELEGATE_TOOL_NAME = "delegate_to_extractor"


async def create_subagent_session(
    *,
    user_id: PydanticObjectId,
    title: str,
    description: str | None = None,
) -> AgentSession:
    """Create a fresh AgentSession for a subagent run and insert it."""
    session = AgentSession(
        user_id=user_id,
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

    async def record_system_note(self, content: str) -> None:
        """Persist a system message (e.g. 'Loaded article, starting extraction')."""
        await persist_session_message(self.session, role="system", content=content)
        await self.session.save()

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

        await persist_session_message(
            self.session,
            role="assistant",
            content=content or "(tool use only)",
            tool_calls=self._tool_calls or None,
            thinking_content="".join(self._thinking_parts).strip() or None,
            tokens=self._tokens,
        )
        await self.session.save()

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
        await persist_session_message(
            self.session,
            role="assistant",
            content=summary or f"Tool {tool_name} completed",
            tool_calls=[
                {
                    "id": str(uuid.uuid4()),
                    "name": tool_name,
                    "arguments": tool_input,
                    "result": result,
                    "resultSummary": summary,
                }
            ],
        )
        await self.session.save()

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
        """Emit a synthetic `delegate_to_extractor` tool_call into this session.

        The frontend `ToolCallBlock` has a custom renderer for this tool name
        that shows an "Open extractor session →" button pointing at
        `child_session_id`, and updates its status chip live as subsequent
        calls to `record_delegation` with the same tool-call id arrive.

        Returns the tool-call id so the orchestrator can pass it to a follow-up
        `update_delegation_status()` call when the extractor completes.
        """
        tool_call_id = str(uuid.uuid4())
        await persist_session_message(
            self.session,
            role="assistant",
            content=detail or f"Delegating extraction: {article_title}",
            tool_calls=[
                {
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
            ],
        )
        await self.session.save()
        return tool_call_id

    async def update_delegation_status(
        self,
        *,
        child_session_id: PydanticObjectId | None,
        article_url: str,
        article_title: str,
        status: str,
        detail: str | None = None,
    ) -> None:
        """Write a follow-up delegation message with the final status.

        We write a NEW message rather than mutating the prior one so the
        timeline is append-only and the WebSocket stream replays cleanly.
        """
        await persist_session_message(
            self.session,
            role="assistant",
            content=detail or f"Extraction {status}: {article_title}",
            tool_calls=[
                {
                    "id": str(uuid.uuid4()),
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
            ],
        )
        await self.session.save()

    async def end(self) -> None:
        """Mark the session complete."""
        self.session.end_session()
        await self.session.save()
