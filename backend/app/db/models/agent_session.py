"""Agent session models for chat metadata and persisted message history."""

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class MessageRole(str, Enum):
    """Message role in conversation."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class SessionKind(str, Enum):
    """Session origin / lifecycle semantics."""

    CHAT = "chat"
    TASK_RUN = "task_run"
    SUBAGENT = "subagent"


class SessionMessage(BaseModel):
    """Individual message in a session (embedded, not a separate collection)."""

    # Populated when the message was read from `AgentSessionMessage` so the
    # frontend can address it for in-place updates (delegation status etc.).
    # Legacy embedded messages leave this None.
    id: PydanticObjectId | None = None

    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Optional references
    decision_id: PydanticObjectId | None = None  # If message includes a decision
    tool_calls: list[dict] = Field(default_factory=list)  # Tools used in this turn
    thinking_content: str | None = None

    # Message metadata
    tokens_used: int | None = None


class PendingQuestionState(BaseModel):
    """Persist an unanswered ask_user prompt so it can be restored later."""

    id: str
    question: str
    options: list[str] = Field(default_factory=list)
    multi_select: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentSessionMessage(Document):
    """Persist a single chat message outside the hot session document."""

    session_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    role: MessageRole
    content: str
    timestamp: Indexed(datetime) = Field(default_factory=lambda: datetime.now(UTC))  # type: ignore[valid-type]
    decision_id: PydanticObjectId | None = None
    tool_calls: list[dict] = Field(default_factory=list)
    thinking_content: str | None = None
    tokens_used: int | None = None

    class Settings:
        name = "agent_session_messages"
        indexes = [
            IndexModel(
                [("session_id", ASCENDING), ("timestamp", ASCENDING)],
                name="session_messages_session_timestamp_asc",
            ),
            IndexModel(
                [("user_id", ASCENDING), ("session_id", ASCENDING), ("timestamp", DESCENDING)],
                name="session_messages_user_session_timestamp_desc",
            ),
        ]

    def to_session_message(self) -> SessionMessage:
        """Convert the persisted message document to the API/session model."""
        return SessionMessage(
            id=self.id,
            role=self.role,
            content=self.content,
            timestamp=self.timestamp,
            decision_id=self.decision_id,
            tool_calls=self.tool_calls,
            thinking_content=self.thinking_content,
            tokens_used=self.tokens_used,
        )

    @classmethod
    def from_session_message(
        cls,
        *,
        session_id: PydanticObjectId,
        user_id: PydanticObjectId,
        message: SessionMessage,
    ) -> "AgentSessionMessage":
        """Build a persisted message document from a session message value."""
        return cls(
            session_id=session_id,
            user_id=user_id,
            role=message.role,
            content=message.content,
            timestamp=message.timestamp,
            decision_id=message.decision_id,
            tool_calls=message.tool_calls,
            thinking_content=message.thinking_content,
            tokens_used=message.tokens_used,
        )


class AgentSession(Document):
    """Agent chat session document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    sdk_session_id: str | None = None

    # Session identification
    session_kind: SessionKind = SessionKind.CHAT
    title: str | None = None  # Auto-generated or user-provided
    description: str | None = None

    # Legacy embedded conversation history kept for older sessions.
    # New writes go to AgentSessionMessage instead.
    messages: list[SessionMessage] = Field(default_factory=list)
    active_pending_question: PendingQuestionState | None = None

    # Session statistics
    total_messages: int = 0
    user_messages: int = 0
    assistant_messages: int = 0
    decisions_made: int = 0
    trades_executed: int = 0
    total_tokens: int = 0

    # Primary symbols discussed
    symbols_discussed: list[str] = Field(default_factory=list)

    # Session state
    is_active: bool = True

    # Timestamps
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None
    last_message_at: Indexed(datetime) | None = None  # type: ignore[valid-type]

    class Settings:
        name = "agent_sessions"
        use_state_management = True
        indexes = [
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("last_message_at", DESCENDING),
                    ("started_at", DESCENDING),
                ],
                name="sessions_user_last_started_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("is_active", ASCENDING),
                    ("last_message_at", DESCENDING),
                ],
                name="sessions_user_active_last_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("symbols_discussed", ASCENDING),
                    ("last_message_at", DESCENDING),
                ],
                name="sessions_user_symbol_last_desc",
            ),
        ]

    def add_message(
        self,
        role: str,
        content: str,
        decision_id: PydanticObjectId | None = None,
        tool_calls: list[dict] | None = None,
        thinking_content: str | None = None,
        tokens: int = 0,
    ) -> SessionMessage:
        """Add a message to the session."""
        role_enum = MessageRole(role)
        message = SessionMessage(
            role=role_enum,
            content=content,
            decision_id=decision_id,
            tool_calls=tool_calls or [],
            thinking_content=thinking_content,
            tokens_used=tokens if tokens > 0 else None,
        )

        self.messages.append(message)
        if role_enum == MessageRole.USER and not self.title:
            self.title = self.build_message_title(content)
        self.record_message(role_enum, tokens=tokens, timestamp=message.timestamp)

        return message

    def record_message(
        self,
        role: MessageRole | str,
        *,
        tokens: int = 0,
        timestamp: datetime | None = None,
    ) -> None:
        """Update counters and timestamps for a newly persisted session message."""
        role_enum = role if isinstance(role, MessageRole) else MessageRole(role)
        self.total_messages += 1
        self.last_message_at = timestamp or datetime.now(UTC)
        self.total_tokens += tokens

        if role_enum == MessageRole.USER:
            self.user_messages += 1
        elif role_enum == MessageRole.ASSISTANT:
            self.assistant_messages += 1

    def set_pending_question(
        self,
        question_id: str,
        question: str,
        options: list[str] | None = None,
        multi_select: bool = False,
    ) -> PendingQuestionState:
        """Persist the active unanswered agent question for this session."""
        self.active_pending_question = PendingQuestionState(
            id=question_id,
            question=question,
            options=options or [],
            multi_select=multi_select,
        )
        return self.active_pending_question

    def clear_pending_question(self, question_id: str | None = None) -> None:
        """Clear the active pending question if it matches the provided ID."""
        if (
            question_id
            and self.active_pending_question
            and self.active_pending_question.id != question_id
        ):
            return
        self.active_pending_question = None

    def add_decision(self) -> None:
        """Increment decision counter."""
        self.decisions_made += 1

    def add_trade(self) -> None:
        """Increment trade counter."""
        self.trades_executed += 1

    def add_symbol(self, symbol: str) -> None:
        """Track a symbol discussed in this session."""
        if symbol not in self.symbols_discussed:
            self.symbols_discussed.append(symbol)

    def end_session(self) -> None:
        """End the session."""
        self.is_active = False
        self.ended_at = datetime.now(UTC)

    @staticmethod
    def build_message_title(content: str) -> str:
        """Generate a session title from a user message."""
        title = content[:50]
        if len(content) > 50:
            title += "..."
        return title

    def generate_title(self) -> str:
        """Generate a title from the first user message."""
        for msg in self.messages:
            if msg.role != MessageRole.USER:
                continue
            return self.build_message_title(msg.content)

        return f"Session {self.started_at.strftime('%Y-%m-%d %H:%M')}"


async def fetch_session_messages(
    session: AgentSession,
    *,
    skip: int = 0,
    limit: int | None = None,
) -> tuple[list[SessionMessage], int]:
    """Load session messages from the dedicated collection with legacy fallback."""
    query = AgentSessionMessage.find(AgentSessionMessage.session_id == session.id).sort(
        "+timestamp"
    )

    if session.messages:
        persisted_docs = await query.to_list()
        combined = [*session.messages, *[doc.to_session_message() for doc in persisted_docs]]
        combined = _normalize_delegation_messages(combined)
        combined.sort(key=lambda message: message.timestamp)
        total = len(combined)
        if limit is None:
            return combined[skip:], total
        return combined[skip : skip + limit], total

    if limit is None:
        docs = await query.to_list()
    else:
        docs = await query.skip(skip).limit(limit).to_list()
    messages = _normalize_delegation_messages([doc.to_session_message() for doc in docs])
    total = (
        len(messages)
        if limit is None
        else await AgentSessionMessage.find(AgentSessionMessage.session_id == session.id).count()
    )
    return messages, total


async def fetch_session_message_window(
    session: AgentSession,
    *,
    before: datetime | None = None,
    limit: int = 100,
) -> tuple[list[SessionMessage], int, bool, datetime | None]:
    """Load the newest message window with an optional older-history cursor."""
    if limit <= 0:
        return [], 0, False, None

    if session.messages:
        combined, total = await fetch_session_messages(session)
        if before is not None:
            combined = [message for message in combined if message.timestamp < before]
        has_more = len(combined) > limit
        window = combined[-limit:]
        next_before = window[0].timestamp if has_more and window else None
        window = _normalize_delegation_messages(window)
        return window, total, has_more, next_before

    total = await AgentSessionMessage.find(AgentSessionMessage.session_id == session.id).count()
    query = AgentSessionMessage.find(AgentSessionMessage.session_id == session.id)
    if before is not None:
        query = query.find(AgentSessionMessage.timestamp < before)

    docs = await query.sort("-timestamp").limit(limit + 1).to_list()
    has_more = len(docs) > limit
    window_docs = docs[:limit]
    window_docs.reverse()
    messages = _normalize_delegation_messages([doc.to_session_message() for doc in window_docs])
    next_before = messages[0].timestamp if has_more and messages else None
    return messages, total, has_more, next_before


def _normalize_delegation_messages(messages: list[SessionMessage]) -> list[SessionMessage]:
    """Collapse duplicate extractor delegation cards into one latest-status message.

    Older explorer runs persisted one initial `running` delegation card and then a
    second terminal `ok/failed/skipped` card for the same extractor/article. When
    those sessions are loaded, keep the original card position but replace its
    content/tool state with the latest terminal update.
    """

    normalized: list[SessionMessage] = []
    delegation_indexes: dict[tuple[str, str, str | None], int] = {}

    for message in messages:
        delegation_key, status = _extract_delegation_identity(message)
        if delegation_key is None or status is None:
            normalized.append(message)
            continue

        previous_index = delegation_indexes.get(delegation_key)
        if previous_index is None:
            delegation_indexes[delegation_key] = len(normalized)
            normalized.append(message)
            continue

        previous_message = normalized[previous_index]
        _, previous_status = _extract_delegation_identity(previous_message)

        if status == "running" and previous_status != "running":
            continue

        replacement = SessionMessage(
            id=previous_message.id,
            role=message.role,
            content=message.content,
            timestamp=previous_message.timestamp,
            decision_id=message.decision_id,
            tool_calls=message.tool_calls,
            thinking_content=message.thinking_content,
            tokens_used=message.tokens_used,
        )
        normalized[previous_index] = replacement

    return normalized


def _extract_delegation_identity(
    message: SessionMessage,
) -> tuple[tuple[str, str, str | None] | None, str | None]:
    """Return the explorer delegation identity and status when present."""

    if len(message.tool_calls) != 1:
        return None, None

    tool_call = message.tool_calls[0]
    if tool_call.get("name") != "delegate_to_extractor":
        return None, None

    arguments = tool_call.get("arguments") or {}
    result = tool_call.get("result") or {}
    article_url = str(arguments.get("article_url") or "").strip()
    article_title = str(arguments.get("article_title") or "").strip()
    if not article_url and not article_title:
        return None, None

    child_session_id = result.get("session_id")
    delegation_key = (
        article_url,
        article_title,
        str(child_session_id) if child_session_id is not None else None,
    )
    return delegation_key, str(result.get("status") or "").strip() or None


async def persist_session_message_doc(
    session: AgentSession,
    *,
    role: str,
    content: str,
    decision_id: PydanticObjectId | None = None,
    tool_calls: list[dict] | None = None,
    thinking_content: str | None = None,
    tokens: int = 0,
    timestamp: datetime | None = None,
) -> AgentSessionMessage:
    """Persist a message and return the inserted document (with id).

    Use this when callers need to reference the message later for in-place
    updates — e.g. `StrategyExtractorAgent` mutating its delegation card
    from "running" to "saved" on completion.
    """
    role_enum = MessageRole(role)
    message = SessionMessage(
        role=role_enum,
        content=content,
        timestamp=timestamp or datetime.now(UTC),
        decision_id=decision_id,
        tool_calls=tool_calls or [],
        thinking_content=thinking_content,
        tokens_used=tokens if tokens > 0 else None,
    )
    document = AgentSessionMessage.from_session_message(
        session_id=session.id,
        user_id=session.user_id,
        message=message,
    )
    await document.insert()
    if role_enum == MessageRole.USER and not session.title:
        session.title = session.build_message_title(content)
    session.record_message(role_enum, tokens=tokens, timestamp=message.timestamp)
    return document


async def persist_session_message(
    session: AgentSession,
    *,
    role: str,
    content: str,
    decision_id: PydanticObjectId | None = None,
    tool_calls: list[dict] | None = None,
    thinking_content: str | None = None,
    tokens: int = 0,
    timestamp: datetime | None = None,
) -> SessionMessage:
    """Persist a message in the dedicated collection and update session counters."""
    document = await persist_session_message_doc(
        session,
        role=role,
        content=content,
        decision_id=decision_id,
        tool_calls=tool_calls,
        thinking_content=thinking_content,
        tokens=tokens,
        timestamp=timestamp,
    )
    return document.to_session_message()


async def delete_session_message_history(session_id: PydanticObjectId) -> None:
    """Delete all persisted messages associated with a session."""
    await AgentSessionMessage.get_pymongo_collection().delete_many({"session_id": session_id})
