"""Log viewer endpoints (admin-only)."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import get_current_superuser
from app.db.models.log import LogRecord
from app.db.models.user import User

router = APIRouter()


# ── Response schemas ────────────────────────────────────────────


class LogEntryResponse(BaseModel):
    id: str
    timestamp: datetime
    level: str
    logger_name: str
    message: str
    module: str | None = None
    function: str | None = None
    line: int | None = None
    request_id: str | None = None
    user_id: str | None = None
    extra: dict | None = None
    traceback: str | None = None


class LogListResponse(BaseModel):
    logs: list[LogEntryResponse]
    total: int
    page: int
    page_size: int


class LogStatsResponse(BaseModel):
    total_count: int
    level_counts: dict[str, int]
    module_counts: dict[str, int]


# ── Helpers ─────────────────────────────────────────────────────


def _log_to_response(log: LogRecord) -> LogEntryResponse:
    return LogEntryResponse(
        id=str(log.id),
        timestamp=log.timestamp,
        level=log.level,
        logger_name=log.logger_name,
        message=log.message,
        module=log.module,
        function=log.function,
        line=log.line,
        request_id=log.request_id,
        user_id=log.user_id,
        extra=log.extra,
        traceback=log.traceback,
    )


# ── Endpoints ───────────────────────────────────────────────────


@router.get("", response_model=LogListResponse)
async def list_logs(
    level: str | None = Query(None, description="Filter by level (INFO, WARNING, ERROR, CRITICAL)"),
    search: str | None = Query(None, description="Search in message text"),
    module: str | None = Query(None, description="Filter by logger module"),
    start_date: datetime | None = Query(None, description="Start of date range"),
    end_date: datetime | None = Query(None, description="End of date range"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
) -> dict:
    """List log entries with filters and pagination."""
    query: dict[str, Any] = {}

    if level:
        query["level"] = level.upper()

    if search:
        query["message"] = {"$regex": search, "$options": "i"}

    if module:
        query["logger_name"] = {"$regex": module, "$options": "i"}

    if start_date or end_date:
        ts_filter: dict[str, Any] = {}
        if start_date:
            ts_filter["$gte"] = start_date
        if end_date:
            ts_filter["$lte"] = end_date
        query["timestamp"] = ts_filter

    total = await LogRecord.find(query).count()
    logs = (
        await LogRecord.find(query)
        .sort(-LogRecord.timestamp)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "logs": [_log_to_response(log) for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stats", response_model=LogStatsResponse)
async def get_log_stats(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get aggregate log statistics."""
    collection = LogRecord.get_pymongo_collection()
    total_count = await collection.count_documents({})

    # Aggregate by level
    level_pipeline = [
        {"$group": {"_id": "$level", "count": {"$sum": 1}}},
    ]
    level_results = await collection.aggregate(level_pipeline).to_list(length=100)
    level_counts = {r["_id"]: r["count"] for r in level_results if r["_id"]}

    # Aggregate by logger module (top-level name)
    module_pipeline = [
        {"$group": {"_id": "$logger_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    module_results = await collection.aggregate(module_pipeline).to_list(length=100)
    module_counts = {r["_id"]: r["count"] for r in module_results if r["_id"]}

    return {
        "total_count": total_count,
        "level_counts": level_counts,
        "module_counts": module_counts,
    }
