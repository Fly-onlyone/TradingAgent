"""Admin helpers to test and inspect bug automation flows."""

from __future__ import annotations

from datetime import UTC, datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.logs import get_current_superuser
from app.db.models.bug import Bug
from app.db.models.user import User
from app.services.bug_automation_service import get_bug_automation_service

router = APIRouter()


class BugAutomationEmitRequest(BaseModel):
    message: str | None = Field(None, max_length=500)
    fingerprint_seed: str | None = Field(None, max_length=120)


class BugAutomationEmitResponse(BaseModel):
    ok: bool
    level: str
    emitted_at: datetime


class BugAutomationPreviewEntry(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    category: str | None = None
    source: str | None = None
    fingerprint: str | None = None
    occurrence_count: int = 1
    last_seen_at: datetime | None = None
    updated_at: datetime


class BugAutomationPreviewResponse(BaseModel):
    total_auto_created: int
    open_auto_created: int
    recent: list[BugAutomationPreviewEntry]


class BugAutomationReplayResponse(BaseModel):
    ok: bool
    bug_id: str
    level: str
    replayed_at: datetime


def _build_traceback(tag: str, seed: str) -> str:
    return (
        "Traceback (most recent call last):\n"
        '  File "backend/app/api/v1/bug_automation.py", line 1, in emit\n'
        f"{tag}: {seed}"
    )


def _build_emit_record(
    *,
    level: str,
    user: User,
    message: str,
    seed: str,
) -> dict:
    exception_tag = (
        "TestAutomationCritical" if level == "CRITICAL" else "TestAutomationError"
    )
    return {
        "timestamp": datetime.now(UTC),
        "level": level,
        "logger_name": "app.bug_automation.test",
        "message": message,
        "module": "bug_automation",
        "function": f"emit_{level.lower()}",
        "line": 1,
        "request_id": f"automation-{seed}",
        "user_id": str(user.id),
        "traceback": _build_traceback(exception_tag, seed),
    }


def _preview_entry(bug: Bug) -> BugAutomationPreviewEntry:
    return BugAutomationPreviewEntry(
        id=str(bug.id),
        title=bug.title,
        severity=bug.severity,
        status=bug.status,
        category=bug.category,
        source=bug.source,
        fingerprint=bug.fingerprint,
        occurrence_count=bug.occurrence_count,
        last_seen_at=bug.last_seen_at,
        updated_at=bug.updated_at,
    )


@router.post("/emit-test-error", response_model=BugAutomationEmitResponse)
async def emit_test_error(
    body: BugAutomationEmitRequest,
    user: User = Depends(get_current_superuser),
) -> BugAutomationEmitResponse:
    """Emit a synthetic ERROR event into bug automation ingestion."""
    now = datetime.now(UTC)
    seed = body.fingerprint_seed or now.strftime("%Y%m%d%H%M%S")
    message = body.message or f"Automation test ERROR event [{seed}]"

    service = get_bug_automation_service()
    await service.ingest_log_records(
        [_build_emit_record(level="ERROR", user=user, message=message, seed=seed)]
    )

    return BugAutomationEmitResponse(ok=True, level="ERROR", emitted_at=now)


@router.post("/emit-test-critical", response_model=BugAutomationEmitResponse)
async def emit_test_critical(
    body: BugAutomationEmitRequest,
    user: User = Depends(get_current_superuser),
) -> BugAutomationEmitResponse:
    """Emit a synthetic CRITICAL event into bug automation ingestion."""
    now = datetime.now(UTC)
    seed = body.fingerprint_seed or now.strftime("%Y%m%d%H%M%S")
    message = body.message or f"Automation test CRITICAL event [{seed}]"

    service = get_bug_automation_service()
    await service.ingest_log_records(
        [_build_emit_record(level="CRITICAL", user=user, message=message, seed=seed)]
    )

    return BugAutomationEmitResponse(ok=True, level="CRITICAL", emitted_at=now)


@router.get("/preview", response_model=BugAutomationPreviewResponse)
async def preview_bug_automation(
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_superuser),
) -> BugAutomationPreviewResponse:
    """Show recent auto-created bug entries for automation inspection."""
    auto_query = {"auto_created": True}
    open_auto_query = {"auto_created": True, "status": "open"}
    recent = (
        await Bug.find(open_auto_query).sort("-last_seen_at").limit(limit).to_list()
    )

    collection = Bug.get_pymongo_collection()
    total_auto_created = await collection.count_documents(auto_query)
    open_auto_created = await collection.count_documents(open_auto_query)

    return BugAutomationPreviewResponse(
        total_auto_created=total_auto_created,
        open_auto_created=open_auto_created,
        recent=[_preview_entry(bug) for bug in recent],
    )


@router.post("/replay/{bug_id}", response_model=BugAutomationReplayResponse)
async def replay_bug_automation_event(
    bug_id: PydanticObjectId,
    _: User = Depends(get_current_superuser),
) -> BugAutomationReplayResponse:
    """Replay a bug's last diagnostics payload to test dedupe/reopen behavior."""
    bug = await Bug.get(bug_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")
    if not bug.auto_created:
        raise HTTPException(
            status_code=400, detail="Only auto-created bugs can be replayed"
        )

    now = datetime.now(UTC)
    level = bug.last_level or "ERROR"
    record = {
        "timestamp": now,
        "level": level,
        "logger_name": bug.last_logger_name or "app.bug_automation.test",
        "message": bug.last_message or f"Replay bug {bug_id}",
        "module": bug.last_module,
        "function": bug.last_function,
        "line": bug.last_line,
        "request_id": bug.last_request_id,
        "user_id": bug.last_user_id,
        "traceback": bug.last_traceback,
    }

    service = get_bug_automation_service()
    await service.ingest_log_records([record])

    return BugAutomationReplayResponse(
        ok=True,
        bug_id=str(bug.id),
        level=level,
        replayed_at=now,
    )
