"""User ratings for strategies."""

from datetime import UTC, datetime

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class StrategyRating(Document):
    """User rating and feedback on a strategy."""

    user_id: PydanticObjectId
    strategy_knowledge_id: PydanticObjectId

    rating: float = Field(ge=1.0, le=5.0)
    helpfulness: float | None = Field(default=None, ge=1.0, le=5.0)
    notes: str | None = None
    experience_level: str = "intermediate"
    tags: list[str] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "strategy_ratings"
        indexes = [
            IndexModel(
                [("strategy_knowledge_id", ASCENDING), ("user_id", ASCENDING)],
                name="strategy_ratings_unique",
                unique=True,
            ),
            IndexModel(
                [("strategy_knowledge_id", ASCENDING), ("rating", DESCENDING)],
                name="strategy_ratings_by_strategy_desc",
            ),
        ]
