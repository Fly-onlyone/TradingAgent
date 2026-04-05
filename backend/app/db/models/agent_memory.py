"""Agent memory model for cross-session context persistence."""

from datetime import UTC, datetime, timedelta
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class MemoryCategory(str, Enum):
    """Memory category determines TTL and retrieval priority."""

    PREFERENCE = "preference"
    WATCHLIST = "watchlist"
    TRADING_CONTEXT = "trading_context"
    MARKET_OBSERVATION = "market_observation"
    DECISION_RATIONALE = "decision_rationale"
    LESSON = "lesson"
    GENERAL = "general"


CATEGORY_TTL: dict[MemoryCategory, timedelta | None] = {
    MemoryCategory.PREFERENCE: None,  # permanent
    MemoryCategory.WATCHLIST: timedelta(days=30),
    MemoryCategory.TRADING_CONTEXT: timedelta(days=7),
    MemoryCategory.MARKET_OBSERVATION: timedelta(hours=24),
    MemoryCategory.DECISION_RATIONALE: timedelta(days=14),
    MemoryCategory.LESSON: timedelta(days=90),
    MemoryCategory.GENERAL: timedelta(days=30),
}

# Max memories per user before save_memory refuses new entries
MAX_MEMORIES_PER_USER = 200

# Max content length (characters)
MAX_CONTENT_LENGTH = 2000


def _compute_expires_at(category: MemoryCategory) -> datetime | None:
    ttl = CATEGORY_TTL.get(category)
    if ttl is None:
        return None
    return datetime.now(UTC) + ttl


class AgentMemory(Document):
    """Persistent memory entry for cross-session agent context."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    category: MemoryCategory
    content: str
    tags: list[str] = Field(default_factory=list)
    source: str = "conversation"  # "conversation" | "task"
    session_id: PydanticObjectId | None = None

    # TTL — MongoDB auto-deletes when expires_at passes (via TTL index)
    expires_at: datetime | None = None

    # Semantic search
    embedding: list[float] | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Usage tracking
    access_count: int = 0
    last_accessed_at: datetime | None = None

    class Settings:
        name = "agent_memories"
        indexes = [
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("category", ASCENDING),
                    ("updated_at", DESCENDING),
                ],
                name="memories_user_category_updated",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("tags", ASCENDING),
                    ("updated_at", DESCENDING),
                ],
                name="memories_user_tags_updated",
            ),
            IndexModel(
                [("expires_at", ASCENDING)],
                expireAfterSeconds=0,
                name="memory_ttl",
            ),
        ]
