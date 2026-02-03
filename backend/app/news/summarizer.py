"""News summarizer using Claude for article summarization and sentiment analysis."""

from typing import Any, Optional

from anthropic import Anthropic

from app.config import get_settings

settings = get_settings()


class NewsSummarizer:
    """Summarizes news articles and analyzes sentiment using Claude."""

    def __init__(self) -> None:
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    async def summarize_article(
        self,
        title: str,
        content: str,
        max_length: int = 200,
    ) -> str:
        """Generate a concise summary of an article."""
        truncated_content = content[:10000] if len(content) > 10000 else content

        prompt = f"""Summarize the following news article in {max_length} characters or less.
Focus on the key facts and implications for cryptocurrency markets.

Title: {title}

Content:
{truncated_content}

Summary:"""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        summary = response.content[0].text.strip()
        return (
            summary[: max_length - 3] + "..." if len(summary) > max_length else summary
        )

    async def analyze_sentiment(
        self,
        title: str,
        content: str,
    ) -> dict[str, Any]:
        """Analyze sentiment of an article for trading implications."""
        truncated_content = content[:5000] if len(content) > 5000 else content

        prompt = f"""Analyze the sentiment of this news article for cryptocurrency trading.

Title: {title}

Content:
{truncated_content}

Provide your analysis in the following format:
1. SENTIMENT_SCORE: A number from -1.0 (very bearish) to 1.0 (very bullish)
2. PREDICTED_IMPACT: One of: bullish, bearish, neutral
3. CONFIDENCE: A number from 0.0 to 1.0
4. KEY_FACTORS: List 2-3 key factors
5. TIMEFRAME: short_term, medium_term, or long_term

Response:"""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        return self._parse_sentiment_response(response.content[0].text.strip())

    def _parse_sentiment_response(self, response: str) -> dict[str, Any]:
        """Parse sentiment analysis response."""
        result = {
            "sentiment_score": 0.0,
            "predicted_impact": "neutral",
            "confidence": 0.5,
            "key_factors": [],
            "timeframe": "medium_term",
        }

        for line in response.split("\n"):
            line = line.strip()

            if line.startswith("SENTIMENT_SCORE:"):
                try:
                    score = float(line.split(":", 1)[1].strip())
                    result["sentiment_score"] = max(-1.0, min(1.0, score))
                except (ValueError, IndexError):
                    pass

            elif line.startswith("PREDICTED_IMPACT:"):
                impact = line.split(":", 1)[1].strip().lower()
                if impact in ["bullish", "bearish", "neutral"]:
                    result["predicted_impact"] = impact

            elif line.startswith("CONFIDENCE:"):
                try:
                    conf = float(line.split(":", 1)[1].strip())
                    result["confidence"] = max(0.0, min(1.0, conf))
                except (ValueError, IndexError):
                    pass

            elif line.startswith("KEY_FACTORS:"):
                factors_text = line.split(":", 1)[1].strip()
                if "," in factors_text:
                    result["key_factors"] = [f.strip() for f in factors_text.split(",")]

            elif line.startswith("TIMEFRAME:"):
                tf = line.split(":", 1)[1].strip().lower()
                if tf in ["short_term", "medium_term", "long_term"]:
                    result["timeframe"] = tf

        return result

    async def analyze_relevance(
        self,
        title: str,
        content: str,
        assets: Optional[list[str]] = None,
    ) -> float:
        """Analyze how relevant an article is for trading."""
        truncated_content = content[:3000] if len(content) > 3000 else content

        assets_text = (
            f"\nSpecific assets of interest: {', '.join(assets)}" if assets else ""
        )

        prompt = f"""Rate the relevance of this news article for cryptocurrency trading on a scale from 0.0 to 1.0.

Consider:
- Does it contain actionable trading information?
- Does it discuss price movements, market trends, or catalysts?
- Is it timely and current?
{assets_text}

Title: {title}

Content:
{truncated_content}

Respond with ONLY a number between 0.0 and 1.0:"""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}],
        )

        try:
            score = float(response.content[0].text.strip())
            return max(0.0, min(1.0, score))
        except ValueError:
            return 0.5

    async def get_market_sentiment_overview(
        self,
        recent_articles: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Get overall market sentiment from recent articles."""
        if not recent_articles:
            return {
                "overall_sentiment": 0.0,
                "sentiment_label": "neutral",
                "bullish_count": 0,
                "bearish_count": 0,
                "neutral_count": 0,
                "total_articles": 0,
            }

        total_weighted_sentiment = 0.0
        total_weight = 0.0
        bullish_count = 0
        bearish_count = 0
        neutral_count = 0

        for article in recent_articles:
            sentiment = article.get("sentiment_score", 0.0)
            confidence = article.get("confidence", 0.5)
            relevance = article.get("relevance_score", 0.5)

            weight = confidence * relevance
            total_weighted_sentiment += sentiment * weight
            total_weight += weight

            if sentiment > 0.2:
                bullish_count += 1
            elif sentiment < -0.2:
                bearish_count += 1
            else:
                neutral_count += 1

        overall = total_weighted_sentiment / total_weight if total_weight > 0 else 0.0

        if overall > 0.3:
            label = "bullish"
        elif overall < -0.3:
            label = "bearish"
        elif overall > 0.1:
            label = "slightly_bullish"
        elif overall < -0.1:
            label = "slightly_bearish"
        else:
            label = "neutral"

        return {
            "overall_sentiment": overall,
            "sentiment_label": label,
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
            "neutral_count": neutral_count,
            "total_articles": len(recent_articles),
        }
