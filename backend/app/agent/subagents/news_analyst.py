"""News Analyst subagent for news sentiment analysis."""

from typing import Any, Optional

from anthropic import Anthropic

from app.config import get_settings
from app.agent.tools.news_tools import get_latest_news, get_news_sentiment, search_news

settings = get_settings()

NEWS_ANALYST_PROMPT = """You are an expert news analyst specializing in cryptocurrency and financial markets. Your role is to analyze news articles, assess sentiment, and identify market-moving information.

## Your Expertise:
1. **Sentiment Analysis**: Determine if news is bullish, bearish, or neutral
2. **Impact Assessment**: Evaluate potential market impact of news
3. **Source Credibility**: Consider the reliability of news sources
4. **Timing Analysis**: Assess if news is priced in or new information
5. **Cross-Reference**: Connect related news items for broader context

## Analysis Framework:
When analyzing news:
1. Identify the main topic and affected assets
2. Assess sentiment (bullish/bearish/neutral)
3. Evaluate source credibility
4. Determine potential market impact
5. Check for conflicting information
6. Provide trading implications

## Output Format:
Always provide:
- News summary with key points
- Overall sentiment score (-1 to +1)
- Credibility-weighted assessment
- Affected assets list
- Potential market impact (high/medium/low)
- Trading recommendation based on news"""


class NewsAnalyst:
    """News analysis subagent."""

    def __init__(self):
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    async def analyze(
        self,
        assets: Optional[list[str]] = None,
        hours: int = 24,
    ) -> dict[str, Any]:
        """Perform news analysis for specified assets.

        Args:
            assets: List of assets to analyze
            hours: Time window for news

        Returns:
            News analysis with sentiment and recommendations
        """
        # Gather news data
        news = await get_latest_news(assets=assets, limit=15)
        sentiment = await get_news_sentiment(assets=assets, hours=hours)

        # Build context for Claude
        context = f"""
Assets of Interest: {', '.join(assets) if assets else 'All major crypto'}
Time Window: Last {hours} hours

## Latest News:
{self._format_news(news)}

## Sentiment Overview:
{self._format_sentiment(sentiment)}

Based on this news data, provide your analysis and trading implications.
"""

        # Get Claude's analysis
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=NEWS_ANALYST_PROMPT,
            messages=[{"role": "user", "content": context}],
        )

        analysis_text = response.content[0].text if response.content else ""

        # Extract trading signal from analysis
        signal = self._extract_signal(analysis_text, sentiment)

        return {
            "assets": assets,
            "timeframe_hours": hours,
            "article_count": news.get("count", 0),
            "sentiment_data": sentiment,
            "analysis": analysis_text,
            "signal": signal,
            "top_news": news.get("articles", [])[:5],
        }

    async def analyze_breaking_news(
        self,
        query: str,
        assets: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Analyze specific news topic or breaking news.

        Args:
            query: Search query for news
            assets: Optional asset filter

        Returns:
            Focused news analysis
        """
        # Search for specific news
        news = await search_news(query=query, assets=assets, limit=10)

        if not news.get("articles"):
            return {
                "query": query,
                "assets": assets,
                "analysis": "No relevant news found for the specified query.",
                "signal": {"action": "NO_NEWS", "confidence": 0},
            }

        # Build context
        context = f"""
Search Query: "{query}"
Assets: {', '.join(assets) if assets else 'All'}

## Relevant News Found:
{self._format_news(news)}

Analyze this news and provide:
1. Summary of key information
2. Sentiment assessment
3. Credibility evaluation
4. Potential market impact
5. Immediate trading implications
"""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=NEWS_ANALYST_PROMPT,
            messages=[{"role": "user", "content": context}],
        )

        analysis_text = response.content[0].text if response.content else ""
        signal = self._extract_signal(analysis_text, {"weighted_sentiment": 0})

        return {
            "query": query,
            "assets": assets,
            "article_count": len(news.get("articles", [])),
            "analysis": analysis_text,
            "signal": signal,
            "news": news.get("articles", []),
        }

    def _format_news(self, data: dict) -> str:
        """Format news articles for prompt."""
        articles = data.get("articles", [])

        if not articles:
            return "No recent news articles found."

        lines = []
        for i, article in enumerate(articles[:10], 1):
            sentiment_str = ""
            if article.get("sentiment_score") is not None:
                s = article["sentiment_score"]
                sentiment_str = f" [Sentiment: {s:+.2f}]"

            lines.append(f"{i}. {article.get('title')}")
            lines.append(
                f"   Source: {article.get('source')} (Credibility: {article.get('source_credibility', 0.5):.1f})"
            )
            lines.append(
                f"   Assets: {', '.join(article.get('mentioned_assets', []))}{sentiment_str}"
            )
            if article.get("summary"):
                lines.append(f"   Summary: {article.get('summary')[:200]}...")
            lines.append("")

        return "\n".join(lines)

    def _format_sentiment(self, data: dict) -> str:
        """Format sentiment data for prompt."""
        lines = [
            f"Article Count: {data.get('article_count', 0)}",
            f"Overall Sentiment: {data.get('overall_sentiment', 0):.3f}",
            f"Weighted Sentiment: {data.get('weighted_sentiment', 0):.3f}",
            f"Interpretation: {data.get('interpretation', 'Unknown')}",
            "",
            "Breakdown:",
            f"  Positive: {data.get('sentiment_breakdown', {}).get('positive', 0)}",
            f"  Neutral: {data.get('sentiment_breakdown', {}).get('neutral', 0)}",
            f"  Negative: {data.get('sentiment_breakdown', {}).get('negative', 0)}",
        ]

        top_sources = data.get("top_sources", [])
        if top_sources:
            lines.append("")
            lines.append("Top Sources:")
            for source in top_sources[:3]:
                lines.append(
                    f"  - {source.get('name')}: {source.get('article_count')} articles, "
                    f"avg sentiment {source.get('avg_sentiment', 0):.2f}"
                )

        return "\n".join(lines)

    def _extract_signal(self, analysis: str, sentiment: dict) -> dict:
        """Extract trading signal from analysis."""
        analysis_lower = analysis.lower()
        weighted_sentiment = sentiment.get("weighted_sentiment", 0)

        # Check for explicit signals in analysis
        if "strong buy" in analysis_lower or "very bullish" in analysis_lower:
            action = "STRONG_BUY"
            confidence = 80
        elif "buy" in analysis_lower and weighted_sentiment > 0.2:
            action = "BUY"
            confidence = 65
        elif "strong sell" in analysis_lower or "very bearish" in analysis_lower:
            action = "STRONG_SELL"
            confidence = 80
        elif "sell" in analysis_lower and weighted_sentiment < -0.2:
            action = "SELL"
            confidence = 65
        elif abs(weighted_sentiment) < 0.1:
            action = "NEUTRAL"
            confidence = 60
        elif weighted_sentiment > 0:
            action = "SLIGHT_BULLISH"
            confidence = 55
        else:
            action = "SLIGHT_BEARISH"
            confidence = 55

        return {
            "action": action,
            "confidence": confidence,
            "sentiment_basis": weighted_sentiment,
        }

    async def get_market_sentiment_summary(self) -> dict[str, Any]:
        """Get overall market sentiment summary.

        Returns:
            Market-wide sentiment summary
        """
        # Get sentiment for major assets
        major_assets = ["BTC", "ETH", "SOL", "XRP"]

        results = {}
        for asset in major_assets:
            sentiment = await get_news_sentiment(assets=[asset], hours=24)
            results[asset] = {
                "sentiment": sentiment.get("weighted_sentiment", 0),
                "interpretation": sentiment.get("interpretation", "Unknown"),
                "article_count": sentiment.get("article_count", 0),
            }

        # Overall market sentiment
        overall = await get_news_sentiment(hours=24)

        return {
            "overall_market": {
                "sentiment": overall.get("weighted_sentiment", 0),
                "interpretation": overall.get("interpretation", "Unknown"),
                "article_count": overall.get("article_count", 0),
            },
            "by_asset": results,
            "summary": self._generate_summary(results, overall),
        }

    def _generate_summary(self, by_asset: dict, overall: dict) -> str:
        """Generate a text summary of market sentiment."""
        overall_sentiment = overall.get("weighted_sentiment", 0)

        if overall_sentiment > 0.3:
            mood = "strongly bullish"
        elif overall_sentiment > 0.1:
            mood = "moderately bullish"
        elif overall_sentiment < -0.3:
            mood = "strongly bearish"
        elif overall_sentiment < -0.1:
            mood = "moderately bearish"
        else:
            mood = "neutral"

        # Find outliers
        bullish_assets = [a for a, d in by_asset.items() if d["sentiment"] > 0.2]
        bearish_assets = [a for a, d in by_asset.items() if d["sentiment"] < -0.2]

        summary = f"Overall market sentiment is {mood}."

        if bullish_assets:
            summary += f" Bullish sentiment for: {', '.join(bullish_assets)}."
        if bearish_assets:
            summary += f" Bearish sentiment for: {', '.join(bearish_assets)}."

        return summary
