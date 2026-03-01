"""Frontend log ingestion endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

from app.db.models.log import LogRecord

router = APIRouter()

_ALLOWED_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


class FrontendLogIngestRequest(BaseModel):
    level: str = Field(..., min_length=1, max_length=16)
    message: str = Field(..., min_length=1, max_length=4000)
    logger_name: str | None = Field(None, max_length=200)
    module: str | None = Field(None, max_length=500)
    function: str | None = Field(None, max_length=200)
    line: int | None = Field(None, ge=0)
    request_id: str | None = Field(None, max_length=120)
    page_url: str | None = Field(None, max_length=1000)
    user_agent: str | None = Field(None, max_length=1000)
    traceback: str | None = Field(None, max_length=16000)
    extra: dict[str, Any] | None = None

    @field_validator("level")
    @classmethod
    def validate_level(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in _ALLOWED_LEVELS:
            raise ValueError("Invalid level")
        return normalized


class FrontendLogIngestResponse(BaseModel):
    ok: bool
    ingested_at: datetime


@router.post("/frontend", response_model=FrontendLogIngestResponse, status_code=202)
async def ingest_frontend_log(
    body: FrontendLogIngestRequest,
    request: Request,
) -> FrontendLogIngestResponse:
    """Persist a frontend log record."""
    now = datetime.now(UTC)

    extra = dict(body.extra or {})
    if body.page_url:
        extra["page_url"] = body.page_url
    if body.user_agent:
        extra["user_agent"] = body.user_agent

    request_id = body.request_id or request.headers.get("x-request-id")

    record = {
        "timestamp": now,
        "level": body.level,
        "logger_name": body.logger_name or "frontend.client",
        "message": body.message,
        "module": body.module,
        "function": body.function,
        "line": body.line,
        "request_id": request_id,
        "user_id": None,
        "extra": extra or None,
        "traceback": body.traceback,
    }

    await LogRecord(**record).insert()

    return FrontendLogIngestResponse(ok=True, ingested_at=now)
