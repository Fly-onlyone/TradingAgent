"""News intelligence models (MongoDB/Beanie)."""

from datetime import datetime, timezone, UTC
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel


class NewsSourceType(str, Enum):
    """Allowed news source categories."""

    OFFICIAL = "official"
    MAJOR_NEWS = "major_news"
    NEWS = "news"
    BLOG = "blog"
    SOCIAL = "social"
    UNKNOWN = "unknown"


class NewsSource(Document):
    """News sources with credibility tracking."""

    # Source info
    name: str
    domain: Indexed(str, unique=True)  # type: ignore[valid-type]
    source_type: NewsSourceType = NewsSourceType.UNKNOWN
    description: Optional[str] = None

    # Credibility
    credibility_score: float = Field(default=0.5, ge=0.0, le=1.0)
    accuracy_history: Optional[dict] = None  # Track prediction accuracy
    bias_rating: Optional[str] = None  # 'neutral', 'bullish', 'bearish'

    # Crawling config
    rss_url: Optional[str] = None
    crawl_enabled: bool = True
    crawl_interval_hours: int = 1
    last_crawled: Optional[datetime] = None
    last_error: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("source_type", mode="before")
    @classmethod
    def _normalize_source_type(cls, value: NewsSourceType | str) -> NewsSourceType:
        if isinstance(value, NewsSourceType):
            return value

        normalized = value.strip().lower()
        aliases = {
            "major": NewsSourceType.MAJOR_NEWS,
            "major-news": NewsSourceType.MAJOR_NEWS,
            "majornews": NewsSourceType.MAJOR_NEWS,
            "official_news": NewsSourceType.OFFICIAL,
            "official-news": NewsSourceType.OFFICIAL,
        }
        if normalized in aliases:
            return aliases[normalized]

        try:
            return NewsSourceType(normalized)
        except ValueError:
            return NewsSourceType.UNKNOWN

    class Settings:
        name = "news_sources"
        use_state_management = True
        indexes = [
            IndexModel(
                [("crawl_enabled", ASCENDING), ("credibility_score", DESCENDING)],
                name="news_sources_crawl_credibility",
            ),
            IndexModel(
                [("source_type", ASCENDING), ("credibility_score", DESCENDING)],
                name="news_sources_type_credibility",
            ),
        ]

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(UTC)


class NewsArticle(Document):
    """News articles with deduplication."""

    source_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Article content
    url: Indexed(str, unique=True)  # type: ignore[valid-type]
    url_hash: Indexed(str)  # type: ignore[valid-type]  # SHA256 for fast lookup
    content_hash: Indexed(str)  # type: ignore[valid-type]  # Detect duplicate content
    title: str
    content: str
    summary: Optional[str] = None  # AI-generated summary

    # Analysis
    sentiment_score: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    relevance_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    mentioned_assets: Optional[list[str]] = None  # ['BTC', 'ETH', ...]
    keywords: Optional[list[str]] = None  # Extracted keywords

    # Prediction tracking
    predicted_impact: Optional[str] = None  # 'bullish', 'bearish', 'neutral'
    actual_impact: Optional[str] = None
    prediction_verified: bool = False

    # Embedding for semantic search (768-dim nomic-embed-text-v1.5 vector)
    embedding: Optional[list[float]] = None

    # Timestamps
    published_at: Optional[datetime] = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "news_articles"
        use_state_management = True
        indexes = [
            IndexModel(
                [("published_at", DESCENDING)],
                name="news_published_desc",
            ),
            IndexModel(
                [("source_id", ASCENDING), ("published_at", DESCENDING)],
                name="news_source_published_desc",
            ),
            IndexModel(
                [("mentioned_assets", ASCENDING), ("published_at", DESCENDING)],
                name="news_assets_published_desc",
            ),
            IndexModel(
                [("relevance_score", DESCENDING), ("published_at", DESCENDING)],
                name="news_relevance_published_desc",
            ),
        ]


class CredibilityEvent(Document):
    """Track source credibility based on prediction accuracy."""

    source_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    article_id: Optional[PydanticObjectId] = None

    # Prediction evaluation
    prediction_type: str  # 'price_movement', 'event'
    predicted_outcome: str
    actual_outcome: str
    was_accurate: bool
    confidence_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    # Context
    symbol: Optional[str] = None
    timeframe_hours: Optional[int] = None

    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "credibility_events"
        use_state_management = True
        indexes = [
            IndexModel(
                [("source_id", ASCENDING), ("evaluated_at", DESCENDING)],
                name="credibility_source_evaluated_desc",
            ),
        ]
