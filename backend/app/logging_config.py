"""Centralized logging configuration with console, file, and MongoDB handlers."""

import asyncio
import json
import logging
import os
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Optional

from app.config import get_settings

# Context variable for request-scoped data
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


# ============================================================
# JSON File Formatter
# ============================================================


class JSONFormatter(logging.Formatter):
    """Format log records as JSON lines for file output."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Attach context vars if available
        req_id = request_id_var.get(None)
        if req_id:
            entry["request_id"] = req_id

        uid = user_id_var.get(None)
        if uid:
            entry["user_id"] = uid

        if record.exc_info and record.exc_info[0] is not None:
            entry["traceback"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


# ============================================================
# Console Formatter (colored)
# ============================================================

LEVEL_COLORS = {
    "DEBUG": "\033[36m",  # Cyan
    "INFO": "\033[32m",  # Green
    "WARNING": "\033[33m",  # Yellow
    "ERROR": "\033[31m",  # Red
    "CRITICAL": "\033[35m",  # Magenta
}
RESET = "\033[0m"


class ColoredFormatter(logging.Formatter):
    """Human-readable colored format for console output."""

    def format(self, record: logging.LogRecord) -> str:
        color = LEVEL_COLORS.get(record.levelname, "")
        level = f"{color}{record.levelname:<8}{RESET}"
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%H:%M:%S"
        )
        name = record.name.replace("app.", "")

        req_id = request_id_var.get(None)
        req_part = f" [{req_id[:8]}]" if req_id else ""

        msg = f"{ts} {level} {name}{req_part} | {record.getMessage()}"

        if record.exc_info and record.exc_info[0] is not None:
            msg += "\n" + self.formatException(record.exc_info)

        return msg


# ============================================================
# Async MongoDB Handler
# ============================================================


class MongoDBHandler(logging.Handler):
    """Buffered async handler that persists log records to MongoDB.

    Records are buffered and flushed in batches to avoid blocking the
    event loop on every log call.
    """

    def __init__(self, buffer_size: int = 50, flush_interval: float = 5.0):
        super().__init__()
        self._buffer: list[dict] = []
        self._buffer_size = buffer_size
        self._flush_interval = flush_interval
        self._flush_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def start(self) -> None:
        """Start the periodic flush task. Call after event loop is running."""
        try:
            self._loop = asyncio.get_running_loop()
            self._flush_task = self._loop.create_task(self._periodic_flush())
        except RuntimeError:
            pass

    async def stop(self) -> None:
        """Flush remaining records and stop."""
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self._flush_buffer()

    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc),
            "level": record.levelname,
            "logger_name": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "request_id": request_id_var.get(None),
            "user_id": user_id_var.get(None),
        }

        if record.exc_info and record.exc_info[0] is not None:
            entry["traceback"] = "".join(traceback.format_exception(*record.exc_info))

        self._buffer.append(entry)

        if len(self._buffer) >= self._buffer_size:
            if self._loop and self._loop.is_running():
                self._loop.create_task(self._flush_buffer())

    async def _periodic_flush(self) -> None:
        """Flush buffer periodically."""
        while True:
            await asyncio.sleep(self._flush_interval)
            await self._flush_buffer()

    async def _flush_buffer(self) -> None:
        """Write buffered records to MongoDB."""
        if not self._buffer:
            return

        records = self._buffer.copy()
        self._buffer.clear()

        try:
            from app.db.models.log import LogRecord

            docs = [LogRecord(**r) for r in records]
            await LogRecord.insert_many(docs)
        except Exception as exc:
            # Avoid recursion — don't log failures from the log handler
            sys.stderr.write(
                f"Failed to flush {len(records)} log records to MongoDB: {exc}\n"
            )


# ============================================================
# Module-level singleton
# ============================================================

_mongo_handler: Optional[MongoDBHandler] = None


def get_mongo_handler() -> Optional[MongoDBHandler]:
    return _mongo_handler


def setup_logging() -> MongoDBHandler:
    """Configure application logging. Call once during startup."""
    global _mongo_handler

    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Root logger
    root = logging.getLogger()
    root.setLevel(log_level)

    # Remove existing handlers to avoid duplicates on reload
    root.handlers.clear()

    # 1. Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(log_level)
    console.setFormatter(ColoredFormatter())
    root.addHandler(console)

    # 2. Rotating file handler (JSON lines)
    log_dir = settings.log_dir
    os.makedirs(log_dir, exist_ok=True)
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, "app.jsonl"),
        maxBytes=settings.log_max_bytes,
        backupCount=settings.log_backup_count,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(JSONFormatter())
    root.addHandler(file_handler)

    # 3. MongoDB handler (started later when event loop is available)
    _mongo_handler = MongoDBHandler()
    _mongo_handler.setLevel(logging.WARNING)  # Only WARNING+ to DB
    root.addHandler(_mongo_handler)

    # Quieten noisy third-party loggers
    for name in ("uvicorn.access", "httpcore", "httpx", "motor", "pymongo"):
        logging.getLogger(name).setLevel(logging.WARNING)

    logging.getLogger("uvicorn.error").setLevel(log_level)

    return _mongo_handler
