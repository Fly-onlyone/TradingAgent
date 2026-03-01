"""News analysis tools for the trading agent."""

from datetime import datetime, timedelta, timezone, UTC
from typing import Any, Optional

from app.db.models.news import NewsArticle, NewsSource


async def get_latest_news(
    assets: Optional[list[str]] = None,
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
        # Normalize asset names
        normalized_assets = [a.upper().replace("-USDT", "") for a in assets]
        query = query.find({"mentioned_assets": {"$in": normalized_assets}})

    articles = await query.sort(-NewsArticle.published_at).limit(limit).to_list()

    news_items = []
    for article in articles:
        # Get source info
        source = await NewsSource.get(article.source_id)
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
    assets: Optional[list[str]] = None,
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
        normalized_assets = [a.upper().replace("-USDT", "") for a in assets]
        query = query.find({"mentioned_assets": {"$in": normalized_assets}})

    articles = await query.to_list()

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
        source = await NewsSource.get(article.source_id)
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
    assets: Optional[list[str]] = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Search news articles by query.

    Args:
        query: Search query
        assets: Optional asset filter
        limit: Number of results

    Returns:
        Matching news articles
    """
    # Build search filter
    search_filter = {
        "$or": [
            {"title": {"$regex": query, "$options": "i"}},
            {"content": {"$regex": query, "$options": "i"}},
            {"summary": {"$regex": query, "$options": "i"}},
        ]
    }

    if assets:
        normalized_assets = [a.upper().replace("-USDT", "") for a in assets]
        search_filter["mentioned_assets"] = {"$in": normalized_assets}

    articles = (
        await NewsArticle.find(search_filter).sort(-NewsArticle.published_at).limit(limit).to_list()
    )

    news_items = []
    for article in articles:
        source = await NewsSource.get(article.source_id)

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
            }
        )

    return {
        "query": query,
        "assets": assets,
        "articles": news_items,
        "count": len(news_items),
    }
