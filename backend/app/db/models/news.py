"""News intelligence models (MongoDB/Beanie)."""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class NewsSource(Document):
    """News sources with credibility tracking."""

    # Source info
    name: str
    domain: Indexed(str, unique=True)  # type: ignore[valid-type]
    source_type: str  # 'official', 'major_news', 'news', 'blog', 'social'
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

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "news_sources"
        use_state_management = True

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(timezone.utc)


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

    # Embedding for semantic search (1024-dim BGE-M3 vector)
    embedding: Optional[list[float]] = None

    # Timestamps
    published_at: Optional[datetime] = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "news_articles"
        use_state_management = True


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

    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "credibility_events"
        use_state_management = True
