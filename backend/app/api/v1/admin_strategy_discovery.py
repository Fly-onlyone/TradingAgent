"""Admin endpoints for the agentic strategy auto-discovery pipeline."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import get_current_superuser
from app.db.models.strategy_discovery_cycle import (
    DiscoveryCycleStatus,
    StrategyDiscoveryCycle,
)
from app.db.models.user import User
from app.services.strategy_discovery import StrategyDiscoveryService

logger = logging.getLogger(__name__)

router = APIRouter()


class CycleRunResponse(BaseModel):
    cycle_id: str
    explorer_session_id: str | None
    candidates_found: int
    strategies_saved: int
    strategies_skipped_low_confidence: int
    strategies_failed: int
    error: str | None = None


class CycleSummary(BaseModel):
    id: str
    status: DiscoveryCycleStatus
    manual: bool
    triggered_by_user_id: str | None = None
    explorer_session_id: str | None = None
    extractor_session_ids: list[str] = []
    candidates_found: int
    strategies_saved: int
    strategies_skipped_low_confidence: int
    strategies_failed: int
    error: str | None = None
    started_at: datetime
    ended_at: datetime | None = None


class CycleListResponse(BaseModel):
    cycles: list[CycleSummary]
    total: int
    page: int
    page_size: int


def _cycle_to_summary(cycle: StrategyDiscoveryCycle) -> CycleSummary:
    return CycleSummary(
        id=str(cycle.id),
        status=cycle.status,
        manual=cycle.manual,
        triggered_by_user_id=(
            str(cycle.triggered_by_user_id) if cycle.triggered_by_user_id else None
        ),
        explorer_session_id=(str(cycle.explorer_session_id) if cycle.explorer_session_id else None),
        extractor_session_ids=[str(x) for x in cycle.extractor_session_ids],
        candidates_found=cycle.candidates_found,
        strategies_saved=cycle.strategies_saved,
        strategies_skipped_low_confidence=cycle.strategies_skipped_low_confidence,
        strategies_failed=cycle.strategies_failed,
        error=cycle.error,
        started_at=cycle.started_at,
        ended_at=cycle.ended_at,
    )


@router.post("/run", response_model=CycleRunResponse)
async def run_cycle(
    current_user: User = Depends(get_current_superuser),
) -> CycleRunResponse:
    """Manually trigger one auto-discovery cycle (blocks until complete)."""
    service = StrategyDiscoveryService()
    try:
        stats = await asyncio.wait_for(
            service.run_discovery_cycle(user_id=current_user.id, manual=True),
            timeout=600,  # 10-minute ceiling for manual runs
        )
    except TimeoutError as exc:
        logger.warning("Manual strategy-discovery cycle exceeded 600s", exc_info=True)
        raise HTTPException(
            status_code=504,
            detail="Discovery cycle timed out after 10 minutes",
        ) from exc
    return CycleRunResponse(
        cycle_id=str(stats.get("cycle_id", "")),
        explorer_session_id=stats.get("explorer_session_id"),
        candidates_found=stats.get("candidates_found", 0),
        strategies_saved=stats.get("strategies_saved", 0),
        strategies_skipped_low_confidence=stats.get("strategies_skipped_low_confidence", 0),
        strategies_failed=stats.get("strategies_failed", 0),
        error=stats.get("error"),
    )


@router.get("/cycles", response_model=CycleListResponse)
async def list_cycles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_superuser),
) -> CycleListResponse:
    """Paginated list of past discovery cycles, newest first."""
    query = StrategyDiscoveryCycle.find_all().sort("-started_at")
    total = await query.count()
    cycles = await query.skip((page - 1) * page_size).limit(page_size).to_list()
    return CycleListResponse(
        cycles=[_cycle_to_summary(c) for c in cycles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cycles/{cycle_id}", response_model=CycleSummary)
async def get_cycle(
    cycle_id: str,
    _: User = Depends(get_current_superuser),
) -> CycleSummary:
    cycle = await StrategyDiscoveryCycle.get(PydanticObjectId(cycle_id))
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return _cycle_to_summary(cycle)
