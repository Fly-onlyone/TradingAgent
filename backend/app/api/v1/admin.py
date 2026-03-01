"""Admin endpoints for database management (superuser only)."""

import re
from typing import Any

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import get_current_superuser
from app.config import get_settings
from app.db.models.user import User
from app.db.session import get_client, get_db

router = APIRouter()

# Collection name to display name mapping
COLLECTION_DISPLAY_NAMES = {
    "users": "Users",
    "orders": "Orders",
    "strategies": "Strategies",
    "strategy_knowledge": "Knowledge",
    "trade_lessons": "Trade Lessons",
    "trading_patterns": "Patterns",
    "news_sources": "News Sources",
    "news_articles": "News Articles",
    "credibility_events": "Credibility Events",
    "market_data": "Market Data",
    "trades": "Trades",
    "agent_tasks": "Tasks",
    "agent_decisions": "Decisions",
    "agent_sessions": "Sessions",
    "notifications": "Notifications",
    "user_notification_settings": "Notification Settings",
}


class CollectionInfo(BaseModel):
    """Collection information."""

    name: str
    display_name: str
    document_count: int
    storage_size: int = 0
    index_count: int = 0
    avg_document_size: int = 0


class CollectionListResponse(BaseModel):
    """List of collections response."""

    collections: list[CollectionInfo]


class DatabaseInfoResponse(BaseModel):
    """Database connection info and stats."""

    database_name: str
    host: str
    total_collections: int
    total_documents: int
    total_storage_size: int
    total_index_size: int
    server_version: str
    uptime_seconds: int


class DocumentListResponse(BaseModel):
    """Paginated document list response."""

    documents: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    collection: str


class DocumentUpdateRequest(BaseModel):
    """Request body for updating a document."""

    document: dict[str, Any]


class SentryTestResponse(BaseModel):
    """Response payload for manual Sentry test events."""

    status: str
    message: str
    event_id: str | None = None


@router.post("/sentry-test", response_model=SentryTestResponse)
async def create_sentry_test_event(
    _: User = Depends(get_current_superuser),
) -> SentryTestResponse:
    error = RuntimeError("Manual Sentry backend test from /api/v1/admin/sentry-test")
    event_id = sentry_sdk.capture_exception(error)
    return SentryTestResponse(
        status="sent",
        message="Backend Sentry test event was sent.",
        event_id=event_id,
    )


def _sanitize_mongodb_url(url: str) -> str:
    """Hide credentials from MongoDB connection URL."""
    return re.sub(r"://[^@]+@", "://***:***@", url)


@router.get("/db-info", response_model=DatabaseInfoResponse)
async def get_database_info(
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    Get database connection info and aggregate stats.

    Requires superuser privileges.
    """
    settings = get_settings()
    client = get_client()
    db = get_db()

    server_info = await client.server_info()
    db_stats = await db.command("dbStats")

    return {
        "database_name": settings.mongodb_db_name,
        "host": _sanitize_mongodb_url(settings.mongodb_url),
        "total_collections": db_stats.get("collections", 0),
        "total_documents": db_stats.get("objects", 0),
        "total_storage_size": db_stats.get("storageSize", 0),
        "total_index_size": db_stats.get("indexSize", 0),
        "server_version": server_info.get("version", "unknown"),
        "uptime_seconds": server_info.get("uptimeMillis", 0) // 1000,
    }


@router.get("/collections", response_model=CollectionListResponse)
async def list_collections(
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    List all database collections with document counts.

    Requires superuser privileges.
    """
    db = get_db()

    collections = []
    collection_names = await db.list_collection_names()

    for name in sorted(collection_names):
        # Skip system collections
        if name.startswith("system."):
            continue

        count = await db[name].count_documents({})
        display_name = COLLECTION_DISPLAY_NAMES.get(name, name.replace("_", " ").title())

        # Get per-collection stats
        storage_size = 0
        index_count = 0
        avg_doc_size = 0
        try:
            coll_stats = await db.command("collStats", name)
            storage_size = coll_stats.get("storageSize", 0)
            index_count = coll_stats.get("nindexes", 0)
            avg_doc_size = coll_stats.get("avgObjSize", 0)
        except Exception:
            pass

        collections.append(
            CollectionInfo(
                name=name,
                display_name=display_name,
                document_count=count,
                storage_size=storage_size,
                index_count=index_count,
                avg_document_size=avg_doc_size,
            )
        )

    return {"collections": collections}


@router.get("/collections/{collection_name}", response_model=DocumentListResponse)
async def get_collection_documents(
    collection_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    Get paginated documents from a collection.

    Requires superuser privileges.

    Args:
        collection_name: Name of the MongoDB collection
        page: Page number (1-indexed)
        page_size: Number of documents per page
        search: Optional search text (searches in _id field)
    """
    db = get_db()

    # Verify collection exists
    collection_names = await db.list_collection_names()
    if collection_name not in collection_names:
        raise HTTPException(status_code=404, detail="Collection not found")

    collection = db[collection_name]

    # Build query
    query: dict[str, Any] = {}
    if search:
        # Simple search - try to match _id or string fields
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            query = {"_id": ObjectId(search)}
        except InvalidId:
            # Search in common text fields
            query = {
                "$or": [
                    {"email": {"$regex": search, "$options": "i"}},
                    {"symbol": {"$regex": search, "$options": "i"}},
                    {"name": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                ]
            }

    # Count total documents
    total = await collection.count_documents(query)

    # Get paginated documents
    cursor = collection.find(query).sort("_id", -1).skip((page - 1) * page_size).limit(page_size)

    documents = []
    async for doc in cursor:
        # Convert ObjectId to string for JSON serialization
        doc = _serialize_document(doc)
        documents.append(doc)

    return {
        "documents": documents,
        "total": total,
        "page": page,
        "page_size": page_size,
        "collection": collection_name,
    }


@router.get("/collections/{collection_name}/{document_id}")
async def get_document(
    collection_name: str,
    document_id: str,
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    Get a single document by ID.

    Requires superuser privileges.
    """
    from bson import ObjectId
    from bson.errors import InvalidId

    db = get_db()

    # Verify collection exists
    collection_names = await db.list_collection_names()
    if collection_name not in collection_names:
        raise HTTPException(status_code=404, detail="Collection not found")

    try:
        doc = await db[collection_name].find_one({"_id": ObjectId(document_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return _serialize_document(doc)


@router.delete("/collections/{collection_name}/{document_id}")
async def delete_document(
    collection_name: str,
    document_id: str,
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    Delete a document by ID.

    Requires superuser privileges.
    """
    from bson import ObjectId
    from bson.errors import InvalidId

    db = get_db()

    collection_names = await db.list_collection_names()
    if collection_name not in collection_names:
        raise HTTPException(status_code=404, detail="Collection not found")

    try:
        obj_id = ObjectId(document_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    result = await db[collection_name].delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    return {"deleted": True}


@router.put("/collections/{collection_name}/{document_id}")
async def update_document(
    collection_name: str,
    document_id: str,
    body: DocumentUpdateRequest,
    _: User = Depends(get_current_superuser),
) -> dict:
    """
    Update a document by ID.

    Requires superuser privileges.
    """
    from bson import ObjectId
    from bson.errors import InvalidId

    db = get_db()

    collection_names = await db.list_collection_names()
    if collection_name not in collection_names:
        raise HTTPException(status_code=404, detail="Collection not found")

    try:
        obj_id = ObjectId(document_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    # Strip _id from update payload to avoid immutable field error
    update_data = {k: v for k, v in body.document.items() if k != "_id"}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db[collection_name].update_one({"_id": obj_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    updated_doc = await db[collection_name].find_one({"_id": obj_id})
    return _serialize_document(updated_doc)


def _serialize_document(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict."""
    from datetime import datetime

    from bson import ObjectId

    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = _serialize_document(value)
        elif isinstance(value, list):
            result[key] = [
                (
                    _serialize_document(item)
                    if isinstance(item, dict)
                    else (
                        str(item)
                        if isinstance(item, ObjectId)
                        else item.isoformat()
                        if isinstance(item, datetime)
                        else item
                    )
                )
                for item in value
            ]
        else:
            result[key] = value
    return result
