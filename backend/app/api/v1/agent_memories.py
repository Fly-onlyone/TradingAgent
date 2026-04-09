"""Agent memory endpoints for viewing and managing cross-session memories."""

from datetime import UTC, datetime, timedelta

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_active_user
from app.db.models.agent_memory import (
    CATEGORY_TTL,
    MAX_CONTENT_LENGTH,
    AgentMemory,
    MemoryCategory,
)
from app.db.models.user import User

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class MemoryResponse(BaseModel):
    id: str
    category: str
    content: str
    tags: list[str]
    source: str
    session_id: str | None
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    access_count: int
    last_accessed_at: datetime | None

    class Config:
        from_attributes = True


class MemoryListResponse(BaseModel):
    memories: list[MemoryResponse]
    total: int
    page: int
    page_size: int


class MemoryCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CONTENT_LENGTH)
    category: MemoryCategory
    tags: list[str] = Field(default_factory=list)


class MemoryUpdateRequest(BaseModel):
    content: str | None = Field(None, min_length=1, max_length=MAX_CONTENT_LENGTH)
    category: MemoryCategory | None = None
    tags: list[str] | None = None


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    category: str | None = None
    limit: int = Field(10, ge=1, le=50)


class MemorySearchResponse(BaseModel):
    query: str
    memories: list[MemoryResponse]
    count: int


class MemoryStatsResponse(BaseModel):
    total: int
    by_category: dict[str, int]
    permanent_count: int
    expiring_soon_count: int


class CategoryInfoResponse(BaseModel):
    value: str
    label: str
    ttl_description: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def memory_to_response(mem: AgentMemory) -> MemoryResponse:
    return MemoryResponse(
        id=str(mem.id),
        category=mem.category.value,
        content=mem.content,
        tags=mem.tags,
        source=mem.source,
        session_id=str(mem.session_id) if mem.session_id else None,
        expires_at=mem.expires_at,
        created_at=mem.created_at,
        updated_at=mem.updated_at,
        access_count=mem.access_count,
        last_accessed_at=mem.last_accessed_at,
    )


def _ttl_description(cat: MemoryCategory) -> str:
    ttl = CATEGORY_TTL.get(cat)
    if ttl is None:
        return "Permanent"
    days = ttl.days
    if days >= 1:
        return f"{days} day{'s' if days != 1 else ''}"
    hours = int(ttl.total_seconds() // 3600)
    return f"{hours} hour{'s' if hours != 1 else ''}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    category: MemoryCategory | None = None,
    tag: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List memories with optional category/tag filtering and pagination."""
    query = AgentMemory.find(AgentMemory.user_id == current_user.id)

    if category:
        query = query.find(AgentMemory.category == category)
    if tag:
        query = query.find({"tags": tag})

    total = await query.count()
    memories = (
        await query.sort("-updated_at").skip((page - 1) * page_size).limit(page_size).to_list()
    )

    return {
        "memories": [memory_to_response(m) for m in memories],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stats", response_model=MemoryStatsResponse)
async def get_memory_stats(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get memory statistics: total, per-category counts, expiring soon."""
    memories = await AgentMemory.find(AgentMemory.user_id == current_user.id).to_list()

    by_category: dict[str, int] = {}
    permanent_count = 0
    expiring_soon_count = 0
    soon = datetime.now(UTC) + timedelta(hours=24)

    for m in memories:
        cat_val = m.category.value
        by_category[cat_val] = by_category.get(cat_val, 0) + 1
        if m.expires_at is None:
            permanent_count += 1
        else:
            exp = m.expires_at if m.expires_at.tzinfo else m.expires_at.replace(tzinfo=UTC)
            if exp <= soon:
                expiring_soon_count += 1

    return {
        "total": len(memories),
        "by_category": by_category,
        "permanent_count": permanent_count,
        "expiring_soon_count": expiring_soon_count,
    }


@router.get("/categories", response_model=list[CategoryInfoResponse])
async def get_categories() -> list[dict]:
    """Return all memory categories with display names and TTL info."""
    return [
        {
            "value": cat.value,
            "label": cat.value.replace("_", " ").title(),
            "ttl_description": _ttl_description(cat),
        }
        for cat in MemoryCategory
    ]


@router.post("", response_model=MemoryResponse, status_code=201)
async def create_memory(
    data: MemoryCreateRequest,
    current_user: User = Depends(get_current_active_user),
) -> MemoryResponse:
    """Create a memory (with dedup and embedding via memory_tools)."""
    from app.agent.tools.memory_tools import save_memory

    result = await save_memory(
        user_id=str(current_user.id),
        content=data.content,
        category=data.category.value,
        tags=data.tags,
        source="manual",
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    memory = await AgentMemory.get(PydanticObjectId(result["id"]))
    if not memory:
        raise HTTPException(status_code=500, detail="Memory created but not found")

    return memory_to_response(memory)


@router.post("/search", response_model=MemorySearchResponse)
async def search_memories_endpoint(
    data: MemorySearchRequest,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Semantic search over memories."""
    from app.agent.tools.memory_tools import search_memories

    result = await search_memories(
        user_id=str(current_user.id),
        query=data.query,
        category=data.category,
        limit=data.limit,
    )

    # Re-fetch full documents for consistent response format
    memory_ids = [PydanticObjectId(m["id"]) for m in result.get("memories", [])]
    memories = []
    for mid in memory_ids:
        mem = await AgentMemory.get(mid)
        if mem:
            memories.append(memory_to_response(mem))

    return {
        "query": data.query,
        "memories": memories,
        "count": len(memories),
    }


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    current_user: User = Depends(get_current_active_user),
) -> MemoryResponse:
    """Get a single memory by ID."""
    memory = await AgentMemory.find_one(
        AgentMemory.id == PydanticObjectId(memory_id),
        AgentMemory.user_id == current_user.id,
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    return memory_to_response(memory)


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory_endpoint(
    memory_id: str,
    data: MemoryUpdateRequest,
    current_user: User = Depends(get_current_active_user),
) -> MemoryResponse:
    """Update a memory (re-embeds if content changes)."""
    from app.agent.tools.memory_tools import update_memory

    result = await update_memory(
        user_id=str(current_user.id),
        memory_id=memory_id,
        content=data.content,
        category=data.category.value if data.category else None,
        tags=data.tags,
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    memory = await AgentMemory.get(PydanticObjectId(result["id"]))
    if not memory:
        raise HTTPException(status_code=500, detail="Memory updated but not found")

    return memory_to_response(memory)


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_active_user),
) -> None:
    """Delete a memory."""
    memory = await AgentMemory.find_one(
        AgentMemory.id == PydanticObjectId(memory_id),
        AgentMemory.user_id == current_user.id,
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    await memory.delete()
