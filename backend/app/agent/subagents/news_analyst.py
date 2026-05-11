"""News Analyst subagent for news sentiment analysis."""

import logging
from typing import Any

from claude_agent_sdk import ClaudeSDKClient

from app.agent.sdk_client import (
    build_sdk_client,
    claude_sdk_workload_slot,
    collect_text_response,
)
from app.agent.tools.news_tools import get_latest_news, get_news_sentiment, search_news
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

NEWS_ANALYST_PROMPT = """You are an expert news analyst specializing in cryptocurrency and financial markets. Your role is to analyze news articles, assess sentiment, and identify market-moving information.

## Your Expertise:
1. **Sentiment Analysis**: Determine if news is bullish, bearish, or neutral
2. **Impact Assessment**: Evaluate potential market impact of news
3. **Source Credibility**: Consider the reliability of news sources
4. **Timing Analysis**: Assess if news is priced in or new information
5. **Cross-Reference**: Connect related news items for broader context
6. **Narrative Continuity**: Detect repeat narratives vs. new information by comparing against historical news in the knowledge base

## Analysis Framework:
When analyzing news:
0. **Historical Context (REQUIRED)**: A "Historical News Coverage" section is provided in the context below — if it contains entries, compare the current story against them. Call out whether the new item is repeating a known narrative (likely priced in) or introducing novel information. If the section is empty, state "no prior coverage found" and proceed.
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
        self._client: ClaudeSDKClient | None = None

    async def connect(self) -> None:
        """Initialize the SDK client."""
        self._client = await build_sdk_client(
            system_prompt=NEWS_ANALYST_PROMPT,
            stderr_source="NewsAnalyst",
        )
        await self._client.connect()
        logger.info("NewsAnalyst connected")

    async def disconnect(self) -> None:
        """Disconnect and clean up."""
        if self._client:
            await self._client.disconnect()
            self._client = None
            logger.info("NewsAnalyst disconnected")

    async def _collect_response(self) -> str:
        """Collect text from SDK response stream."""
        return await collect_text_response(self._client, source="NewsAnalyst")

    async def analyze(
        self,
        assets: list[str] | None = None,
        hours: int = 24,
    ) -> dict[str, Any]:
        """Perform news analysis for specified assets.

        Args:
            assets: List of assets to analyze
            hours: Time window for news

        Returns:
            News analysis with sentiment and recommendations
        """
        if not self._client:
            raise RuntimeError("Analyst not connected. Call connect() first.")

        # Gather news data
        news = await get_latest_news(assets=assets, limit=15)
        sentiment = await get_news_sentiment(assets=assets, hours=hours)

        # Historical RAG news
        historical_section = await self._fetch_historical_news(assets)

        # Fetch real-time web news
        web_news_section = await self._fetch_web_news(assets)

        # Build context for Claude
        context = f"""
Assets of Interest: {", ".join(assets) if assets else "All major crypto"}
Time Window: Last {hours} hours
{historical_section}
## Latest News:
{self._format_news(news)}

## Sentiment Overview:
{self._format_sentiment(sentiment)}
{web_news_section}
Based on this news data, provide your analysis and trading implications.
"""

        # Serialize SDK-backed analyst calls; concurrent CLI workloads are unstable on Windows.
        async with claude_sdk_workload_slot("NewsAnalyst.analyze"):
            await self._client.query(context)
            analysis_text = await self._collect_response()

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
        assets: list[str] | None = None,
    ) -> dict[str, Any]:
        """Analyze specific news topic or breaking news.

        Args:
            query: Search query for news
            assets: Optional asset filter

        Returns:
            Focused news analysis
        """
        if not self._client:
            raise RuntimeError("Analyst not connected. Call connect() first.")

        # Search for specific news from database
        news = await search_news(query=query, assets=assets, limit=10)

        # Also search the web for real-time results
        web_news_section = ""
        try:
            from app.agent.tools.web_search_tools import (
                search_news as brave_search_news,
            )

            web_results = await brave_search_news(query=query, count=5, freshness="pd")
            if web_results.get("articles"):
                web_news_section = "\n## Real-time Web News:\n" + self._format_web_news(web_results)
        except Exception:
            logger.debug("Web search unavailable for breaking news query", exc_info=True)

        if not news.get("articles") and not web_news_section:
            return {
                "query": query,
                "assets": assets,
                "analysis": "No relevant news found for the specified query.",
                "signal": {"action": "NO_NEWS", "confidence": 0},
            }

        # Build context
        context = f"""
Search Query: "{query}"
Assets: {", ".join(assets) if assets else "All"}

## Relevant News Found:
{self._format_news(news)}
{web_news_section}

Analyze this news and provide:
1. Summary of key information
2. Sentiment assessment
3. Credibility evaluation
4. Potential market impact
5. Immediate trading implications
"""

        # Serialize SDK-backed analyst calls; concurrent CLI workloads are unstable on Windows.
        async with claude_sdk_workload_slot("NewsAnalyst.analyze_breaking_news"):
            await self._client.query(context)
            analysis_text = await self._collect_response()

        signal = self._extract_signal(analysis_text, {"weighted_sentiment": 0})

        return {
            "query": query,
            "assets": assets,
            "article_count": len(news.get("articles", [])),
            "analysis": analysis_text,
            "signal": signal,
            "news": news.get("articles", []),
        }

    async def _fetch_historical_news(self, assets: list[str] | None) -> str:
        """Retrieve prior news coverage from the RAG knowledge base for narrative-continuity checks."""
        try:
            asset_str = " ".join(assets) if assets else "crypto market"
            results = await search_news(
                query=f"{asset_str} market narrative",
                assets=assets,
                limit=5,
            )
            articles = results.get("articles", [])
            if not articles:
                return "\n## Historical News Coverage: no prior coverage found\n"

            lines = ["\n## Historical News Coverage (from knowledge base):"]
            for i, article in enumerate(articles, 1):
                lines.append(f"{i}. {article.get('title')}")
                if article.get("summary"):
                    lines.append(f"   {article['summary'][:200]}")
            lines.append("")
            return "\n".join(lines)
        except Exception:
            logger.debug("Historical news RAG lookup failed", exc_info=True)
            return ""

    async def _fetch_web_news(self, assets: list[str] | None) -> str:
        """Fetch real-time news from Brave Search API."""
        try:
            from app.agent.tools.web_search_tools import (
                search_news as brave_search_news,
            )

            asset_str = " ".join(assets) if assets else "crypto"
            web_results = await brave_search_news(
                query=f"{asset_str} cryptocurrency news",
                count=5,
                freshness="pd",
            )
            if web_results.get("articles"):
                return "\n## Real-time Web News:\n" + self._format_web_news(web_results)
        except Exception:
            logger.debug("Web search unavailable for news analysis", exc_info=True)
        return ""

    def _format_web_news(self, data: dict) -> str:
        """Format Brave Search news results for prompt."""
        articles = data.get("articles", [])
        if not articles:
            return "No web news results found."

        lines = []
        for i, article in enumerate(articles, 1):
            breaking = " [BREAKING]" if article.get("breaking") else ""
            lines.append(f"{i}. {article.get('title')}{breaking}")
            lines.append(f"   Source: {article.get('source')} | {article.get('age', 'recent')}")
            if article.get("description"):
                lines.append(f"   {article['description'][:200]}")
            lines.append("")
        return "\n".join(lines)

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
