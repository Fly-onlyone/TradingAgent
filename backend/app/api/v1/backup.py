"""Backup endpoints for full database export/import (superuser only)."""

import logging
from datetime import UTC, datetime
from io import BytesIO

from bson import json_util
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import get_current_superuser
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


class CollectionBackupInfo(BaseModel):
    name: str
    document_count: int
    size_bytes: int


class BackupInfoResponse(BaseModel):
    collections: list[CollectionBackupInfo]
    total_documents: int
    total_size_bytes: int


class ImportResponse(BaseModel):
    status: str
    collections_restored: int
    total_documents: int


@router.get("/info", response_model=BackupInfoResponse)
async def get_backup_info(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Return collection names, document counts, and sizes."""
    db = get_db()
    collection_names = await db.list_collection_names()

    collections = []
    total_documents = 0
    total_size_bytes = 0

    for name in sorted(collection_names):
        if name.startswith("system."):
            continue

        count = await db[name].count_documents({})
        size_bytes = 0
        try:
            stats = await db.command("collStats", name)
            size_bytes = stats.get("storageSize", 0)
        except Exception:
            pass

        collections.append(
            CollectionBackupInfo(name=name, document_count=count, size_bytes=size_bytes)
        )
        total_documents += count
        total_size_bytes += size_bytes

    return {
        "collections": collections,
        "total_documents": total_documents,
        "total_size_bytes": total_size_bytes,
    }


@router.post("/export")
async def export_backup(
    _: User = Depends(get_current_superuser),
) -> StreamingResponse:
    """Export all collections as a downloadable JSON file.

    Uses bson.json_util for MongoDB-safe serialisation (ObjectId, datetime, etc.).
    """
    db = get_db()
    collection_names = await db.list_collection_names()

    backup_data: dict[str, list] = {}
    for name in sorted(collection_names):
        if name.startswith("system."):
            continue

        docs: list = []
        async for doc in db[name].find():
            docs.append(doc)
        backup_data[name] = docs

    payload = json_util.dumps(backup_data, indent=2)
    buffer = BytesIO(payload.encode("utf-8"))

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.json"

    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportResponse)
async def import_backup(
    file: UploadFile,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Restore database from an uploaded backup JSON file.

    **DESTRUCTIVE**: drops existing collections before restoring.
    """
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json backup files are accepted")

    try:
        content = await file.read()
        data = json_util.loads(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid backup file: {exc}") from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail="Backup must be a JSON object mapping collection names to arrays",
        )

    # Validate structure: every value must be a list
    for key, value in data.items():
        if not isinstance(value, list):
            raise HTTPException(
                status_code=400,
                detail=f"Collection '{key}' must be an array of documents",
            )

    db = get_db()
    collections_restored = 0
    total_documents = 0

    for collection_name, documents in data.items():
        if collection_name.startswith("system."):
            continue

        # Drop existing collection before restoring
        await db.drop_collection(collection_name)

        if documents:
            await db[collection_name].insert_many(documents)
            total_documents += len(documents)

        collections_restored += 1
        logger.info("Restored collection '%s' with %d documents", collection_name, len(documents))

    logger.info(
        "Backup import complete: %d collections, %d documents",
        collections_restored,
        total_documents,
    )

    return {
        "status": "success",
        "collections_restored": collections_restored,
        "total_documents": total_documents,
    }
