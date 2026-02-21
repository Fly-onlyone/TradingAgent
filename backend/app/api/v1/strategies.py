"""Strategy management endpoints using Beanie ODM."""

from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db.models.user import User
from app.db.models.strategy import Strategy
from app.api.v1.auth import get_current_active_user

router = APIRouter()


class StrategyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    entry_rules: dict = {}
    exit_rules: dict = {}
    risk_params: dict = {}
    symbols: list[str] = []
    timeframes: list[str] = []


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    entry_rules: Optional[dict] = None
    exit_rules: Optional[dict] = None
    risk_params: Optional[dict] = None
    symbols: Optional[list[str]] = None
    timeframes: Optional[list[str]] = None


class StrategyResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    entry_rules: dict
    exit_rules: dict
    risk_params: dict
    symbols: list
    timeframes: list
    backtest_results: Optional[dict]
    live_performance: Optional[dict]
    created_at: datetime
    updated_at: datetime
    last_executed_at: Optional[datetime]

    class Config:
        from_attributes = True


class StrategyListResponse(BaseModel):
    """Paginated strategy list response."""

    strategies: list[StrategyResponse]
    total: int
    page: int
    page_size: int


def strategy_to_response(strategy: Strategy) -> StrategyResponse:
    return StrategyResponse(
        id=str(strategy.id),
        name=strategy.name,
        description=strategy.description,
        is_active=strategy.is_active,
        entry_rules=strategy.entry_rules,
        exit_rules=strategy.exit_rules,
        risk_params=strategy.risk_params,
        symbols=strategy.symbols,
        timeframes=strategy.timeframes,
        backtest_results=strategy.backtest_results,
        live_performance=strategy.live_performance,
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
        last_executed_at=strategy.last_executed_at,
    )


@router.post("", response_model=StrategyResponse)
async def create_strategy(
    strategy_data: StrategyCreate,
    current_user: User = Depends(get_current_active_user),
) -> StrategyResponse:
    """Create a new trading strategy."""
    strategy = Strategy(
        user_id=current_user.id,
        name=strategy_data.name,
        description=strategy_data.description,
        entry_rules=strategy_data.entry_rules,
        exit_rules=strategy_data.exit_rules,
        risk_params=strategy_data.risk_params,
        symbols=strategy_data.symbols,
        timeframes=strategy_data.timeframes,
    )
    await strategy.insert()
    return strategy_to_response(strategy)


@router.get("", response_model=StrategyListResponse)
async def list_strategies(
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List user's strategies with filtering and pagination."""
    query = Strategy.find(Strategy.user_id == current_user.id)

    if is_active is not None:
        query = query.find(Strategy.is_active == is_active)

    total = await query.count()
    strategies = (
        await query.sort(-Strategy.created_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "strategies": [strategy_to_response(s) for s in strategies],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
) -> StrategyResponse:
    """Get a specific strategy by ID."""
    strategy = await Strategy.find_one(
        Strategy.id == PydanticObjectId(strategy_id),
        Strategy.user_id == current_user.id,
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy_to_response(strategy)


@router.patch("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: str,
    strategy_data: StrategyUpdate,
    current_user: User = Depends(get_current_active_user),
) -> StrategyResponse:
    """Update a strategy."""
    strategy = await Strategy.find_one(
        Strategy.id == PydanticObjectId(strategy_id),
        Strategy.user_id == current_user.id,
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    update_data = strategy_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(strategy, field, value)

    strategy.update_timestamp()
    await strategy.save()
    return strategy_to_response(strategy)


@router.delete("/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Delete a strategy."""
    strategy = await Strategy.find_one(
        Strategy.id == PydanticObjectId(strategy_id),
        Strategy.user_id == current_user.id,
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    await strategy.delete()
    return {"message": "Strategy deleted successfully"}


@router.post("/{strategy_id}/activate", response_model=StrategyResponse)
async def activate_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
) -> StrategyResponse:
    """Activate a strategy for live trading."""
    strategy = await Strategy.find_one(
        Strategy.id == PydanticObjectId(strategy_id),
        Strategy.user_id == current_user.id,
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy.is_active = True
    strategy.update_timestamp()
    await strategy.save()
    return strategy_to_response(strategy)


@router.post("/{strategy_id}/deactivate", response_model=StrategyResponse)
async def deactivate_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
) -> StrategyResponse:
    """Deactivate a strategy."""
    strategy = await Strategy.find_one(
        Strategy.id == PydanticObjectId(strategy_id),
        Strategy.user_id == current_user.id,
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy.is_active = False
    strategy.update_timestamp()
    await strategy.save()
    return strategy_to_response(strategy)
