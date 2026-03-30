"""Agent session model for chat history persistence."""

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


class SessionMessage(BaseModel):
    """Individual message in a session (embedded, not a separate collection)."""

    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Optional references
    decision_id: PydanticObjectId | None = None  # If message includes a decision
    tool_calls: list[dict] = Field(default_factory=list)  # Tools used in this turn
    thinking_content: str | None = None

    # Message metadata
    tokens_used: int | None = None


class AgentSession(Document):
    """Agent chat session document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Session identification
    title: str | None = None  # Auto-generated or user-provided
    description: str | None = None

    # Conversation history
    messages: list[SessionMessage] = Field(default_factory=list)

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
        self.total_messages += 1
        self.last_message_at = datetime.now(UTC)
        self.total_tokens += tokens

        if role_enum == MessageRole.USER:
            self.user_messages += 1
        elif role_enum == MessageRole.ASSISTANT:
            self.assistant_messages += 1

        return message

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

    def generate_title(self) -> str:
        """Generate a title from the first user message."""
        for msg in self.messages:
            if msg.role != MessageRole.USER:
                continue
            title = msg.content[:50]
            if len(msg.content) > 50:
                title += "..."
            return title

        return f"Session {self.started_at.strftime('%Y-%m-%d %H:%M')}"
