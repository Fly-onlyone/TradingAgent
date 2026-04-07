"""News analysis tools for the trading agent."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.models.news import NewsArticle, NewsSource
from app.knowledge.retriever import normalize_assets


async def get_latest_news(
    assets: list[str] | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get latest news articles for specified assets.

    Args:
        assets: List of asset symbols to filter by
        limit: Number of articles to retrieve

    Returns:
        Latest news articles with sentiment
    """
    query = NewsArticle.find()

    if assets:
        query = query.find({"mentioned_assets": {"$in": normalize_assets(assets)}})

    articles = await asyncio.wait_for(
        query.sort(-NewsArticle.published_at).limit(limit).to_list(), timeout=10.0
    )

    news_items = []
    for article in articles:
        # Get source info
        source = await asyncio.wait_for(NewsSource.get(article.source_id), timeout=10.0)
        source_name = source.name if source else "Unknown"
        credibility = source.credibility_score if source else 0.5

        news_items.append(
            {
                "id": str(article.id),
                "title": article.title,
                "summary": article.summary or article.content[:200] + "...",
                "url": article.url,
                "source": source_name,
                "source_credibility": credibility,
                "sentiment_score": article.sentiment_score,
                "relevance_score": article.relevance_score,
                "mentioned_assets": article.mentioned_assets,
                "predicted_impact": article.predicted_impact,
                "published_at": (
                    article.published_at.isoformat() if article.published_at else None
                ),
            }
        )

    # Calculate aggregate sentiment
    if news_items:
        valid_sentiments = [
            n["sentiment_score"] for n in news_items if n["sentiment_score"] is not None
        ]
        avg_sentiment = sum(valid_sentiments) / len(valid_sentiments) if valid_sentiments else 0
    else:
        avg_sentiment = 0

    return {
        "assets": assets,
        "articles": news_items,
        "count": len(news_items),
        "average_sentiment": round(avg_sentiment, 3),
    }


async def get_news_sentiment(
    assets: list[str] | None = None,
    hours: int = 24,
) -> dict[str, Any]:
    """Get aggregated news sentiment for specified assets.

    Args:
        assets: List of asset symbols
        hours: Time window in hours

    Returns:
        Aggregated sentiment analysis
    """
    cutoff_time = datetime.now(UTC) - timedelta(hours=hours)

    query = NewsArticle.find(NewsArticle.published_at >= cutoff_time)

    if assets:
        query = query.find({"mentioned_assets": {"$in": normalize_assets(assets)}})

    articles = await asyncio.wait_for(query.to_list(), timeout=10.0)

    if not articles:
        return {
            "assets": assets,
            "timeframe_hours": hours,
            "article_count": 0,
            "overall_sentiment": 0,
            "sentiment_breakdown": {"positive": 0, "negative": 0, "neutral": 0},
            "weighted_sentiment": 0,
            "top_sources": [],
        }

    # Calculate sentiment metrics
    positive = 0
    negative = 0
    neutral = 0
    weighted_sum = 0
    total_weight = 0
    source_sentiments = {}

    for article in articles:
        sentiment = article.sentiment_score or 0

        # Classify sentiment
        if sentiment > 0.2:
            positive += 1
        elif sentiment < -0.2:
            negative += 1
        else:
            neutral += 1

        # Get source credibility for weighting
        source = await asyncio.wait_for(NewsSource.get(article.source_id), timeout=10.0)
        credibility = source.credibility_score if source else 0.5
        source_name = source.name if source else "Unknown"

        # Track per-source sentiment
        if source_name not in source_sentiments:
            source_sentiments[source_name] = {
                "sum": 0,
                "count": 0,
                "credibility": credibility,
            }
        source_sentiments[source_name]["sum"] += sentiment
        source_sentiments[source_name]["count"] += 1

        # Weighted sentiment (by source credibility)
        weighted_sum += sentiment * credibility
        total_weight += credibility

    overall_sentiment = sum(a.sentiment_score or 0 for a in articles) / len(articles)
    weighted_sentiment = weighted_sum / total_weight if total_weight > 0 else 0

    # Top sources by article count
    top_sources = sorted(
        [
            {
                "name": name,
                "article_count": data["count"],
                "avg_sentiment": round(data["sum"] / data["count"], 3),
                "credibility": data["credibility"],
            }
            for name, data in source_sentiments.items()
        ],
        key=lambda x: x["article_count"],
        reverse=True,
    )[:5]

    # Interpret sentiment
    if weighted_sentiment > 0.3:
        interpretation = "Strong bullish sentiment"
    elif weighted_sentiment > 0.1:
        interpretation = "Mildly bullish sentiment"
    elif weighted_sentiment < -0.3:
        interpretation = "Strong bearish sentiment"
    elif weighted_sentiment < -0.1:
        interpretation = "Mildly bearish sentiment"
    else:
        interpretation = "Neutral sentiment"

    return {
        "assets": assets,
        "timeframe_hours": hours,
        "article_count": len(articles),
        "overall_sentiment": round(overall_sentiment, 3),
        "weighted_sentiment": round(weighted_sentiment, 3),
        "interpretation": interpretation,
        "sentiment_breakdown": {
            "positive": positive,
            "negative": negative,
            "neutral": neutral,
        },
        "top_sources": top_sources,
    }


async def search_news(
    query: str,
    assets: list[str] | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Search news articles by semantic similarity, with regex fallback.

    Retriever handles embedding search with automatic regex fallback.
    """
    from app.knowledge.retriever import get_retriever

    retriever = get_retriever()
    results = await retriever.search_news(query, assets=assets, limit=limit)

    news_items = []
    for article, score in results:
        source = await asyncio.wait_for(NewsSource.get(article.source_id), timeout=10.0)

        news_items.append(
            {
                "id": str(article.id),
                "title": article.title,
                "summary": article.summary or article.content[:200] + "...",
                "url": article.url,
                "source": source.name if source else "Unknown",
                "sentiment_score": article.sentiment_score,
                "mentioned_assets": article.mentioned_assets,
                "published_at": (
                    article.published_at.isoformat() if article.published_at else None
                ),
                "relevance_score": round(score, 3),
            }
        )

    return {
        "query": query,
        "assets": assets,
        "articles": news_items,
        "count": len(news_items),
    }
