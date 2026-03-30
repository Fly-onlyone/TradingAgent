"""Log record model for persistent log storage in MongoDB."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class LogRecord(Document):
    """Persisted log entry."""

    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    level: str  # INFO, WARNING, ERROR, CRITICAL
    logger_name: str  # e.g. "app.agent.trading_agent"
    message: str
    module: str | None = None
    function: str | None = None
    line: int | None = None
    request_id: str | None = None
    user_id: str | None = None
    extra: dict | None = None
    traceback: str | None = None

    class Settings:
        name = "logs"
        indexes = [
            IndexModel([("timestamp", DESCENDING)]),
            IndexModel([("level", ASCENDING)]),
            IndexModel([("logger_name", ASCENDING)]),
            IndexModel(
                [("timestamp", ASCENDING)],
                expireAfterSeconds=2592000,  # 30-day TTL
            ),
        ]
