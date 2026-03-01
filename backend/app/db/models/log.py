"""Log record model for persistent log storage in MongoDB."""

from datetime import datetime, timezone, UTC
from typing import Optional

from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class LogRecord(Document):
    """Persisted log entry."""

    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    level: str  # INFO, WARNING, ERROR, CRITICAL
    logger_name: str  # e.g. "app.agent.trading_agent"
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    extra: Optional[dict] = None
    traceback: Optional[str] = None

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
