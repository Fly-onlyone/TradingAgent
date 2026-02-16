"""Bug tracker model for persistent bug tracking in MongoDB."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class Bug(Document):
    """Tracked bug entry."""

    title: str
    description: str | None = None
    severity: str = "medium"  # low, medium, high, critical
    status: str = "open"  # open, in_progress, resolved
    category: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None

    class Settings:
        name = "bugs"
        indexes = [
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("severity", ASCENDING)]),
            IndexModel([("category", ASCENDING)]),
        ]
