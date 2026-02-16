"""Bug tracker endpoints (admin-only)."""

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.logs import get_current_superuser
from app.db.models.bug import Bug
from app.db.models.user import User

router = APIRouter()


# ── Request / Response schemas ──────────────────────────────────


class BugResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    severity: str
    status: str
    category: str | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class BugListResponse(BaseModel):
    bugs: list[BugResponse]
    total: int
    page: int
    page_size: int


class BugStatsResponse(BaseModel):
    total: int
    status_counts: dict[str, int]
    severity_counts: dict[str, int]


class BugCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    severity: str = Field("medium", pattern=r"^(low|medium|high|critical)$")
    status: str = Field("open", pattern=r"^(open|in_progress|resolved)$")
    category: str | None = None


class BugUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = None
    severity: str | None = Field(None, pattern=r"^(low|medium|high|critical)$")
    status: str | None = Field(None, pattern=r"^(open|in_progress|resolved)$")
    category: str | None = None


# ── Helpers ─────────────────────────────────────────────────────


def _bug_to_response(bug: Bug) -> BugResponse:
    return BugResponse(
        id=str(bug.id),
        title=bug.title,
        description=bug.description,
        severity=bug.severity,
        status=bug.status,
        category=bug.category,
        created_at=bug.created_at,
        updated_at=bug.updated_at,
        resolved_at=bug.resolved_at,
    )


# ── Endpoints ───────────────────────────────────────────────────


@router.get("", response_model=BugListResponse)
async def list_bugs(
    status: str | None = Query(None, description="Filter by status"),
    severity: str | None = Query(None, description="Filter by severity"),
    search: str | None = Query(None, description="Search in title/description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
) -> dict:
    """List bugs with filters and pagination."""
    query: dict[str, Any] = {}

    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    total = await Bug.find(query).count()
    bugs = (
        await Bug.find(query)
        .sort(-Bug.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "bugs": [_bug_to_response(b) for b in bugs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stats", response_model=BugStatsResponse)
async def get_bug_stats(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get aggregate bug statistics."""
    collection = Bug.get_pymongo_collection()
    total = await collection.count_documents({})

    status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    status_results = await collection.aggregate(status_pipeline).to_list(length=100)
    status_counts = {r["_id"]: r["count"] for r in status_results if r["_id"]}

    severity_pipeline = [{"$group": {"_id": "$severity", "count": {"$sum": 1}}}]
    severity_results = await collection.aggregate(severity_pipeline).to_list(length=100)
    severity_counts = {r["_id"]: r["count"] for r in severity_results if r["_id"]}

    return {
        "total": total,
        "status_counts": status_counts,
        "severity_counts": severity_counts,
    }


@router.post("", response_model=BugResponse, status_code=201)
async def create_bug(
    body: BugCreateRequest,
    _: User = Depends(get_current_superuser),
) -> BugResponse:
    """Create a new bug."""
    now = datetime.now(UTC)
    bug = Bug(
        title=body.title,
        description=body.description,
        severity=body.severity,
        status=body.status,
        category=body.category,
        created_at=now,
        updated_at=now,
        resolved_at=now if body.status == "resolved" else None,
    )
    await bug.insert()
    return _bug_to_response(bug)


@router.put("/{bug_id}", response_model=BugResponse)
async def update_bug(
    bug_id: PydanticObjectId,
    body: BugUpdateRequest,
    _: User = Depends(get_current_superuser),
) -> BugResponse:
    """Update an existing bug."""
    bug = await Bug.get(bug_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        return _bug_to_response(bug)

    now = datetime.now(UTC)
    update_data["updated_at"] = now

    # Auto-manage resolved_at
    if "status" in update_data:
        if update_data["status"] == "resolved" and bug.status != "resolved":
            update_data["resolved_at"] = now
        elif update_data["status"] != "resolved" and bug.status == "resolved":
            update_data["resolved_at"] = None

    for key, value in update_data.items():
        setattr(bug, key, value)
    await bug.save()

    return _bug_to_response(bug)


@router.delete("/{bug_id}", status_code=204)
async def delete_bug(
    bug_id: PydanticObjectId,
    _: User = Depends(get_current_superuser),
) -> None:
    """Delete a bug."""
    bug = await Bug.get(bug_id)
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")
    await bug.delete()
