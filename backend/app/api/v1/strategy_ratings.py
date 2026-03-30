"""Strategy rating endpoints."""

from datetime import UTC, datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_active_user
from app.db.models.knowledge import StrategyKnowledge
from app.db.models.strategy_rating import StrategyRating
from app.db.models.user import User
from app.services.strategy_rating_calculator import StrategyRatingCalculator

router = APIRouter()


# --- Request / Response schemas ---


class RatingRequest(BaseModel):
    rating: float = Field(ge=1.0, le=5.0)
    helpfulness: float | None = Field(default=None, ge=1.0, le=5.0)
    notes: str | None = None
    experience_level: str = "intermediate"
    tags: list[str] = Field(default_factory=list)


class RatingResponse(BaseModel):
    id: str
    user_id: str
    strategy_knowledge_id: str
    rating: float
    helpfulness: float | None
    notes: str | None
    experience_level: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class RatingStatsResponse(BaseModel):
    strategy_knowledge_id: str
    average_rating: float | None
    rating_count: int
    overall_rating: float | None
    rating_confidence: float | None


class TopRatedStrategyResponse(BaseModel):
    id: str
    name: str
    description: str
    overall_rating: float | None
    rating_confidence: float | None
    rating_count: int
    average_user_rating: float | None


# --- Endpoints ---


@router.post("/{strategy_knowledge_id}/rate", response_model=RatingResponse)
async def rate_strategy(
    strategy_knowledge_id: PydanticObjectId,
    body: RatingRequest,
    current_user: User = Depends(get_current_active_user),
) -> RatingResponse:
    """Submit or update a rating for a strategy."""
    strategy = await StrategyKnowledge.get(strategy_knowledge_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Upsert: find existing rating by user + strategy
    existing = await StrategyRating.find_one(
        StrategyRating.user_id == current_user.id,
        StrategyRating.strategy_knowledge_id == strategy_knowledge_id,
    )

    now = datetime.now(UTC)

    if existing:
        existing.rating = body.rating
        existing.helpfulness = body.helpfulness
        existing.notes = body.notes
        existing.experience_level = body.experience_level
        existing.tags = body.tags
        existing.updated_at = now
        await existing.save()
        rating_doc = existing
    else:
        rating_doc = StrategyRating(
            user_id=current_user.id,
            strategy_knowledge_id=strategy_knowledge_id,
            rating=body.rating,
            helpfulness=body.helpfulness,
            notes=body.notes,
            experience_level=body.experience_level,
            tags=body.tags,
            created_at=now,
            updated_at=now,
        )
        await rating_doc.insert()

    # Recalculate overall rating
    all_ratings = await StrategyRating.find(
        StrategyRating.strategy_knowledge_id == strategy_knowledge_id
    ).to_list()
    avg_user = sum(r.rating for r in all_ratings) / len(all_ratings) if all_ratings else None

    strategy.average_user_rating = avg_user
    strategy.rating_count = len(all_ratings)

    calculator = StrategyRatingCalculator()
    overall, confidence = await calculator.calculate_overall_rating(strategy)
    strategy.overall_rating = overall
    strategy.rating_confidence = confidence
    strategy.update_timestamp()
    await strategy.save()

    return RatingResponse(
        id=str(rating_doc.id),
        user_id=str(rating_doc.user_id),
        strategy_knowledge_id=str(rating_doc.strategy_knowledge_id),
        rating=rating_doc.rating,
        helpfulness=rating_doc.helpfulness,
        notes=rating_doc.notes,
        experience_level=rating_doc.experience_level,
        tags=rating_doc.tags,
        created_at=rating_doc.created_at,
        updated_at=rating_doc.updated_at,
    )


@router.get("/{strategy_knowledge_id}/ratings", response_model=RatingStatsResponse)
async def get_rating_stats(
    strategy_knowledge_id: PydanticObjectId,
    _current_user: User = Depends(get_current_active_user),
) -> RatingStatsResponse:
    """Get aggregated rating stats for a strategy."""
    strategy = await StrategyKnowledge.get(strategy_knowledge_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    return RatingStatsResponse(
        strategy_knowledge_id=str(strategy_knowledge_id),
        average_rating=strategy.average_user_rating,
        rating_count=strategy.rating_count,
        overall_rating=strategy.overall_rating,
        rating_confidence=strategy.rating_confidence,
    )


@router.get("/top-rated", response_model=list[TopRatedStrategyResponse])
async def get_top_rated_strategies(
    limit: int = Query(default=10, ge=1, le=100),
    _current_user: User = Depends(get_current_active_user),
) -> list[TopRatedStrategyResponse]:
    """Get strategies sorted by overall_rating descending."""
    strategies = (
        await StrategyKnowledge.find(
            StrategyKnowledge.overall_rating != None,  # noqa: E711
        )
        .sort(-StrategyKnowledge.overall_rating)
        .limit(limit)
        .to_list()
    )

    return [
        TopRatedStrategyResponse(
            id=str(s.id),
            name=s.name,
            description=s.description,
            overall_rating=s.overall_rating,
            rating_confidence=s.rating_confidence,
            rating_count=s.rating_count,
            average_user_rating=s.average_user_rating,
        )
        for s in strategies
    ]
