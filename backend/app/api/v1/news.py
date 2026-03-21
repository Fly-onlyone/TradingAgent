"""News intelligence endpoints using Beanie ODM."""

from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.news import NewsArticle, NewsSource
from app.db.models.user import User

router = APIRouter()


# News Source Schemas
class NewsSourceCreate(BaseModel):
    name: str
    domain: str
    source_type: str  # official, major_news, news, blog, social
    description: str | None = None
    rss_url: str | None = None
    crawl_interval_hours: int = 1


class NewsSourceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    source_type: str | None = None
    rss_url: str | None = None
    crawl_enabled: bool | None = None
    crawl_interval_hours: int | None = None
    strategy_extraction: bool | None = None


class NewsSourceResponse(BaseModel):
    id: str
    name: str
    domain: str
    source_type: str
    description: str | None
    credibility_score: float
    accuracy_history: dict | None
    bias_rating: str | None
    rss_url: str | None
    crawl_enabled: bool
    crawl_interval_hours: int
    strategy_extraction: bool
    last_crawled: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# News Article Schemas
class NewsArticleResponse(BaseModel):
    id: str
    source_id: str
    url: str
    title: str
    content: str
    summary: str | None
    sentiment_score: float | None
    relevance_score: float | None
    mentioned_assets: list | None
    keywords: list | None
    predicted_impact: str | None
    actual_impact: str | None
    prediction_verified: bool
    published_at: datetime | None
    fetched_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class NewsArticleListResponse(BaseModel):
    """Paginated news article list response."""

    articles: list[NewsArticleResponse]
    total: int
    page: int
    page_size: int


def source_to_response(source: NewsSource) -> NewsSourceResponse:
    return NewsSourceResponse(
        id=str(source.id),
        name=source.name,
        domain=source.domain,
        source_type=source.source_type,
        description=source.description,
        credibility_score=source.credibility_score,
        accuracy_history=source.accuracy_history,
        bias_rating=source.bias_rating,
        rss_url=source.rss_url,
        crawl_enabled=source.crawl_enabled,
        crawl_interval_hours=source.crawl_interval_hours,
        last_crawled=source.last_crawled,
        last_error=source.last_error,
        created_at=source.created_at,
        updated_at=source.updated_at,
    )


def article_to_response(article: NewsArticle) -> NewsArticleResponse:
    return NewsArticleResponse(
        id=str(article.id),
        source_id=str(article.source_id),
        url=article.url,
        title=article.title,
        content=article.content,
        summary=article.summary,
        sentiment_score=article.sentiment_score,
        relevance_score=article.relevance_score,
        mentioned_assets=article.mentioned_assets,
        keywords=article.keywords,
        predicted_impact=article.predicted_impact,
        actual_impact=article.actual_impact,
        prediction_verified=article.prediction_verified,
        published_at=article.published_at,
        fetched_at=article.fetched_at,
        created_at=article.created_at,
    )


# News Source Endpoints
@router.post("/sources", response_model=NewsSourceResponse)
async def create_news_source(
    data: NewsSourceCreate,
    current_user: User = Depends(get_current_active_user),
) -> NewsSourceResponse:
    """Add a new news source."""
    existing = await NewsSource.find_one(NewsSource.domain == data.domain)
    if existing:
        raise HTTPException(status_code=400, detail="News source with this domain already exists")

    source = NewsSource(
        name=data.name,
        domain=data.domain,
        source_type=data.source_type,
        description=data.description,
        rss_url=data.rss_url,
        crawl_interval_hours=data.crawl_interval_hours,
    )
    await source.insert()
    return source_to_response(source)


@router.get("/sources", response_model=list[NewsSourceResponse])
async def list_news_sources(
    source_type: str | None = None,
    crawl_enabled: bool | None = None,
    min_credibility: float | None = None,
    current_user: User = Depends(get_current_active_user),
) -> list[NewsSourceResponse]:
    """List news sources with filtering."""
    query = NewsSource.find()

    if source_type:
        query = query.find(NewsSource.source_type == source_type)
    if crawl_enabled is not None:
        query = query.find(NewsSource.crawl_enabled == crawl_enabled)
    if min_credibility:
        query = query.find(NewsSource.credibility_score >= min_credibility)

    sources = await query.sort(-NewsSource.credibility_score).to_list()
    return [source_to_response(s) for s in sources]


@router.get("/sources/{source_id}", response_model=NewsSourceResponse)
async def get_news_source(
    source_id: str,
    current_user: User = Depends(get_current_active_user),
) -> NewsSourceResponse:
    """Get a specific news source."""
    source = await NewsSource.get(PydanticObjectId(source_id))
    if not source:
        raise HTTPException(status_code=404, detail="News source not found")
    return source_to_response(source)


@router.patch("/sources/{source_id}", response_model=NewsSourceResponse)
async def update_news_source(
    source_id: str,
    data: NewsSourceUpdate,
    current_user: User = Depends(get_current_active_user),
) -> NewsSourceResponse:
    """Update a news source."""
    source = await NewsSource.get(PydanticObjectId(source_id))
    if not source:
        raise HTTPException(status_code=404, detail="News source not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(source, field, value)

    source.update_timestamp()
    await source.save()
    return source_to_response(source)


@router.delete("/sources/{source_id}")
async def delete_news_source(
    source_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Delete a news source."""
    source = await NewsSource.get(PydanticObjectId(source_id))
    if not source:
        raise HTTPException(status_code=404, detail="News source not found")

    await source.delete()
    return {"message": "News source deleted successfully"}


# News Article Endpoints
@router.get("/articles", response_model=NewsArticleListResponse)
async def list_news_articles(
    source_id: str | None = None,
    asset: str | None = None,
    sentiment: str | None = None,  # positive, negative, neutral
    min_relevance: float | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List news articles with filtering and pagination."""
    query = NewsArticle.find()

    if source_id:
        query = query.find(NewsArticle.source_id == PydanticObjectId(source_id))
    if asset:
        query = query.find({"mentioned_assets": asset.upper()})
    if min_relevance:
        query = query.find(NewsArticle.relevance_score >= min_relevance)
    if sentiment:
        if sentiment == "positive":
            query = query.find(NewsArticle.sentiment_score > 0.2)
        elif sentiment == "negative":
            query = query.find(NewsArticle.sentiment_score < -0.2)
        else:
            query = query.find(
                NewsArticle.sentiment_score >= -0.2,
                NewsArticle.sentiment_score <= 0.2,
            )

    total = await query.count()
    articles = (
        await query.sort(-NewsArticle.published_at)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "articles": [article_to_response(a) for a in articles],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/articles/{article_id}", response_model=NewsArticleResponse)
async def get_news_article(
    article_id: str,
    current_user: User = Depends(get_current_active_user),
) -> NewsArticleResponse:
    """Get a specific news article."""
    article = await NewsArticle.get(PydanticObjectId(article_id))
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article_to_response(article)


# Sentiment Feed Endpoint
@router.get("/sentiment-feed")
async def get_sentiment_feed(
    assets: str | None = None,  # Comma-separated list of assets
    hours: int = Query(24, ge=1, le=168),  # Last N hours
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get aggregated sentiment feed for specified assets."""
    # TODO: Implement sentiment aggregation
    # Calculate weighted sentiment based on source credibility.

    return {
        "assets": assets.split(",") if assets else [],
        "timeframe_hours": hours,
        "overall_sentiment": 0.0,
        "article_count": 0,
        "sentiment_breakdown": {
            "positive": 0,
            "negative": 0,
            "neutral": 0,
        },
        "top_topics": [],
    }
