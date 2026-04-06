"""Strategy import endpoints — extract from URL or file upload, then confirm to save."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.knowledge import StrategyKnowledge
from app.db.models.strategy import Strategy
from app.db.models.user import User
from app.knowledge.embeddings import StrategyEmbeddingGenerator
from app.services.content_reader import fetch_url_content, read_uploaded_file
from app.services.strategy_extractor import StrategyExtractor

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────


class URLImportRequest(BaseModel):
    url: str


class ExtractedStrategyResponse(BaseModel):
    name: str
    description: str
    entry_rules: dict = {}
    exit_rules: dict = {}
    risk_params: dict = {}
    symbols: list[str] = []
    timeframes: list[str] = []
    market_conditions: list[str] = []
    asset_classes: list[str] = []
    source_url: str | None = None
    source_filename: str | None = None
    extraction_messages: list[dict] = []


class StrategyImportConfirm(BaseModel):
    name: str
    description: str
    entry_rules: dict = {}
    exit_rules: dict = {}
    risk_params: dict = {}
    symbols: list[str] = []
    timeframes: list[str] = []
    market_conditions: list[str] = []
    asset_classes: list[str] = []
    source_url: str | None = None
    source_filename: str | None = None
    extraction_messages: list[dict] = []


class StrategyImportResult(BaseModel):
    strategy_id: str
    knowledge_id: str


# ── Endpoints ────────────────────────────────────────────────


@router.post("/url/extract", response_model=ExtractedStrategyResponse)
async def extract_from_url(
    request: URLImportRequest,
    current_user: User = Depends(get_current_active_user),
) -> ExtractedStrategyResponse:
    """Fetch URL content and extract strategy fields via AI (preview step)."""
    try:
        content = await fetch_url_content(request.url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to fetch URL content: {e}") from e

    try:
        extractor = StrategyExtractor()
        extracted = await extractor.extract_from_text(content, source_hint=request.url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}") from e

    return ExtractedStrategyResponse(
        **extracted.model_dump(),
        source_url=request.url,
    )


@router.post("/file/extract", response_model=ExtractedStrategyResponse)
async def extract_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
) -> ExtractedStrategyResponse:
    """Upload file and extract strategy fields via AI (preview step)."""
    try:
        content = await read_uploaded_file(file)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to read file: {e}") from e

    filename = file.filename or "unknown"

    try:
        extractor = StrategyExtractor()
        extracted = await extractor.extract_from_text(content, source_hint=filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}") from e

    return ExtractedStrategyResponse(
        **extracted.model_dump(),
        source_filename=filename,
    )


@router.post("/confirm", response_model=StrategyImportResult)
async def confirm_import(
    data: StrategyImportConfirm,
    current_user: User = Depends(get_current_active_user),
) -> StrategyImportResult:
    """Save confirmed strategy data as both Strategy and StrategyKnowledge."""
    # Check for duplicate strategy name
    existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == data.name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A strategy named '{data.name}' already exists (id: {existing.id})",
        )

    # 1. Create StrategyKnowledge for RAG (first, so we have the ID for linking)
    knowledge = StrategyKnowledge(
        name=data.name,
        description=data.description,
        entry_rules=data.entry_rules,
        exit_rules=data.exit_rules,
        risk_params=data.risk_params,
        market_conditions=data.market_conditions,
        asset_classes=data.asset_classes,
        timeframes=data.timeframes,
        source_url=data.source_url,
        extraction_messages=data.extraction_messages,
    )
    await knowledge.insert()

    # 2. Create user-owned Strategy linked to its StrategyKnowledge
    strategy = Strategy(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        entry_rules=data.entry_rules,
        exit_rules=data.exit_rules,
        risk_params=data.risk_params,
        symbols=data.symbols,
        timeframes=data.timeframes,
        knowledge_id=knowledge.id,
        source_url=data.source_url,
    )
    await strategy.insert()

    # 3. Generate embedding for semantic search
    try:
        generator = StrategyEmbeddingGenerator()
        knowledge.embedding = await generator.generate_strategy_embedding(data.model_dump())
        if knowledge.embedding is not None:
            await knowledge.save()
    except Exception:
        logger.warning(
            "Failed to generate embedding for imported strategy %s", knowledge.id, exc_info=True
        )

    return StrategyImportResult(
        strategy_id=str(strategy.id),
        knowledge_id=str(knowledge.id),
    )
