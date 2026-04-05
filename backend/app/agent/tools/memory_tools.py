"""Memory tools for cross-session agent context persistence."""

import logging
from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId

from app.db.models.agent_memory import (
    MAX_CONTENT_LENGTH,
    MAX_MEMORIES_PER_USER,
    AgentMemory,
    MemoryCategory,
    _compute_expires_at,
)
from app.knowledge.embeddings import EmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)

# Cosine similarity threshold for dedup — above this, update instead of creating
_DEDUP_THRESHOLD = 0.95

# Per-category limits for session-start injection
_INJECTION_LIMITS: dict[MemoryCategory, int] = {
    MemoryCategory.PREFERENCE: 10,
    MemoryCategory.WATCHLIST: 5,
    MemoryCategory.TRADING_CONTEXT: 5,
    MemoryCategory.DECISION_RATIONALE: 3,
    MemoryCategory.LESSON: 2,
    MemoryCategory.GENERAL: 5,
    # market_observation intentionally excluded — too transient for session start
}

_INJECTION_TOTAL_CAP = 25


async def save_memory(
    user_id: str,
    content: str,
    category: str,
    tags: list[str] | None = None,
    source: str = "conversation",
    session_id: str | None = None,
) -> dict[str, Any]:
    """Save a memory, deduplicating against existing same-category memories."""
    try:
        cat = MemoryCategory(category)
    except ValueError:
        valid = [c.value for c in MemoryCategory]
        return {"error": f"Invalid category '{category}'. Valid: {valid}"}

    content = content[:MAX_CONTENT_LENGTH]
    oid = PydanticObjectId(user_id)

    # Check per-user limit
    count = await AgentMemory.find(AgentMemory.user_id == oid).count()
    if count >= MAX_MEMORIES_PER_USER:
        return {
            "error": f"Memory limit reached ({MAX_MEMORIES_PER_USER}). "
            "Delete old memories before saving new ones.",
        }

    embedding_svc = get_embedding_service()
    embedding = await embedding_svc.generate_document_embedding(content)

    # Dedup: check for near-duplicate in same category
    if embedding:
        existing = await _find_duplicate(oid, cat, embedding, embedding_svc)
        if existing:
            existing.content = content
            existing.tags = tags or existing.tags
            existing.embedding = embedding
            existing.updated_at = datetime.now(UTC)
            existing.expires_at = _compute_expires_at(cat)
            await existing.save()
            return {
                "id": str(existing.id),
                "category": cat.value,
                "expires_at": str(existing.expires_at) if existing.expires_at else None,
                "message": "Updated existing similar memory",
            }

    memory = AgentMemory(
        user_id=oid,
        category=cat,
        content=content,
        tags=tags or [],
        source=source,
        session_id=PydanticObjectId(session_id) if session_id else None,
        expires_at=_compute_expires_at(cat),
        embedding=embedding,
    )
    await memory.insert()

    return {
        "id": str(memory.id),
        "category": cat.value,
        "expires_at": str(memory.expires_at) if memory.expires_at else None,
        "message": "Memory saved",
    }


async def _find_duplicate(
    user_id: PydanticObjectId,
    category: MemoryCategory,
    embedding: list[float],
    embedding_svc: EmbeddingService,
) -> AgentMemory | None:
    """Find an existing memory in the same category with high cosine similarity."""
    candidates = (
        await AgentMemory.find(
            AgentMemory.user_id == user_id,
            AgentMemory.category == category,
        )
        .sort(-AgentMemory.updated_at)
        .limit(50)
        .to_list()
    )

    for mem in candidates:
        if mem.embedding:
            sim = embedding_svc.cosine_similarity(embedding, mem.embedding)
            if sim >= _DEDUP_THRESHOLD:
                return mem
    return None


async def search_memories(
    user_id: str,
    query: str,
    category: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Semantic search over user's memories."""
    oid = PydanticObjectId(user_id)
    embedding_svc = get_embedding_service()
    query_embedding = await embedding_svc.generate_query_embedding(query)

    filters: dict[str, Any] = {"user_id": oid}
    if category:
        try:
            filters["category"] = MemoryCategory(category)
        except ValueError:
            pass

    memories = await AgentMemory.find(filters).sort(-AgentMemory.updated_at).limit(100).to_list()

    if query_embedding:
        # Score by cosine similarity and sort
        scored = []
        for mem in memories:
            if mem.embedding:
                sim = embedding_svc.cosine_similarity(query_embedding, mem.embedding)
                scored.append((sim, mem))
            else:
                scored.append((0.0, mem))
        scored.sort(key=lambda x: x[0], reverse=True)
        memories = [mem for _, mem in scored[:limit]]
    else:
        # Fallback: text match
        query_lower = query.lower()
        memories = [m for m in memories if query_lower in m.content.lower()][:limit]

    # Update access tracking
    now = datetime.now(UTC)
    for mem in memories:
        mem.access_count += 1
        mem.last_accessed_at = now
        await mem.save()

    return {
        "query": query,
        "memories": [
            {
                "id": str(m.id),
                "category": m.category.value,
                "content": m.content,
                "tags": m.tags,
                "created_at": str(m.created_at),
                "updated_at": str(m.updated_at),
                "expires_at": str(m.expires_at) if m.expires_at else None,
            }
            for m in memories
        ],
        "count": len(memories),
    }


async def update_memory(
    user_id: str,
    memory_id: str,
    content: str | None = None,
    category: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Update an existing memory. Re-embeds if content changed."""
    oid = PydanticObjectId(user_id)
    memory = await AgentMemory.find_one(
        AgentMemory.id == PydanticObjectId(memory_id),
        AgentMemory.user_id == oid,
    )
    if not memory:
        return {"error": "Memory not found or access denied"}

    updated_fields = []

    if content is not None:
        memory.content = content[:MAX_CONTENT_LENGTH]
        memory.embedding = await get_embedding_service().generate_document_embedding(content)
        updated_fields.append("content")

    if category is not None:
        try:
            new_cat = MemoryCategory(category)
            memory.category = new_cat
            memory.expires_at = _compute_expires_at(new_cat)
            updated_fields.append("category")
        except ValueError:
            return {"error": f"Invalid category '{category}'"}

    if tags is not None:
        memory.tags = tags
        updated_fields.append("tags")

    memory.updated_at = datetime.now(UTC)
    await memory.save()

    return {
        "id": str(memory.id),
        "updated_fields": updated_fields,
        "message": "Memory updated",
    }


async def delete_memory(user_id: str, memory_id: str) -> dict[str, Any]:
    """Delete a memory owned by the user."""
    oid = PydanticObjectId(user_id)
    memory = await AgentMemory.find_one(
        AgentMemory.id == PydanticObjectId(memory_id),
        AgentMemory.user_id == oid,
    )
    if not memory:
        return {"error": "Memory not found or access denied"}

    await memory.delete()
    return {"deleted": True, "id": memory_id}


async def load_session_memories(user_id: str) -> str | None:
    """Load and format memories for injection at session start.

    Returns a formatted text block or None if no memories exist.
    Skips market_observation (too transient for session start).
    """
    oid = PydanticObjectId(user_id)
    now = datetime.now(UTC)

    sections: list[str] = []
    total = 0

    for cat, max_count in _INJECTION_LIMITS.items():
        if total >= _INJECTION_TOTAL_CAP:
            break

        remaining = _INJECTION_TOTAL_CAP - total
        effective_limit = min(max_count, remaining)

        memories = (
            await AgentMemory.find(
                AgentMemory.user_id == oid,
                AgentMemory.category == cat,
            )
            .sort(-AgentMemory.updated_at)
            .limit(effective_limit)
            .to_list()
        )

        # Filter out expired (belt-and-suspenders; TTL index handles this normally)
        memories = [m for m in memories if m.expires_at is None or m.expires_at > now]

        if not memories:
            continue

        # Format category header
        header = cat.value.replace("_", " ").title()
        lines = [f"## {header}"]
        for mem in memories:
            tag_str = f" [{', '.join(mem.tags)}]" if mem.tags else ""
            lines.append(f"- {mem.content}{tag_str}")

        sections.append("\n".join(lines))
        total += len(memories)

    if not sections:
        return None

    return (
        "[MEMORY CONTEXT - Your memories from previous sessions]\n"
        + "\n\n".join(sections)
        + "\n[END MEMORY CONTEXT]"
    )
