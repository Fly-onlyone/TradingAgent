"""Agent session model for chat history persistence."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class MessageRole(str, Enum):
    """Message role in conversation."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class SessionMessage:
    """Individual message in a session (embedded, not a separate collection)."""

    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Optional references
    decision_id: Optional[PydanticObjectId] = None  # If message includes a decision
    tool_calls: list[dict] = Field(default_factory=list)  # Tools used in this turn

    # Message metadata
    tokens_used: Optional[int] = None


class AgentSession(Document):
    """Agent chat session document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Session identification
    title: Optional[str] = None  # Auto-generated or user-provided
    description: Optional[str] = None

    # Conversation history
    messages: list[dict] = Field(default_factory=list)
    # Each message: {role, content, timestamp, decision_id?, tool_calls?}

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
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    last_message_at: Optional[Indexed(datetime)] = None  # type: ignore[valid-type]

    class Settings:
        name = "agent_sessions"
        use_state_management = True

    def add_message(
        self,
        role: str,
        content: str,
        decision_id: Optional[PydanticObjectId] = None,
        tool_calls: Optional[list[dict]] = None,
        tokens: int = 0,
    ) -> dict:
        """Add a message to the session."""
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if decision_id:
            message["decision_id"] = str(decision_id)
        if tool_calls:
            message["tool_calls"] = tool_calls

        self.messages.append(message)
        self.total_messages += 1
        self.last_message_at = datetime.now(timezone.utc)
        self.total_tokens += tokens

        if role == MessageRole.USER.value:
            self.user_messages += 1
        elif role == MessageRole.ASSISTANT.value:
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
        self.ended_at = datetime.now(timezone.utc)

    def generate_title(self) -> str:
        """Generate a title from the first user message."""
        for msg in self.messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                # Take first 50 chars
                title = content[:50]
                if len(content) > 50:
                    title += "..."
                return title
        return f"Session {self.started_at.strftime('%Y-%m-%d %H:%M')}"
