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

    auto_created: bool = False
    source: str | None = None
    fingerprint: str | None = None
    occurrence_count: int = 1
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    last_level: str | None = None
    last_logger_name: str | None = None
    last_module: str | None = None
    last_function: str | None = None
    last_line: int | None = None
    last_request_id: str | None = None
    last_user_id: str | None = None
    last_message: str | None = None
    last_traceback: str | None = None

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
            IndexModel([("auto_created", ASCENDING)]),
            IndexModel([("last_seen_at", DESCENDING)]),
            IndexModel(
                [("fingerprint", ASCENDING)],
                unique=True,
                partialFilterExpression={
                    "auto_created": True,
                    "fingerprint": {"$type": "string"},
                },
            ),
            IndexModel(
                [
                    ("auto_created", ASCENDING),
                    ("status", ASCENDING),
                    ("last_seen_at", DESCENDING),
                ]
            ),
        ]
