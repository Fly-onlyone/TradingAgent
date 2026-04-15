"""News summarizer using Claude for article summarization and sentiment analysis.

Supports two auth modes:
- api_key: Uses the raw Anthropic client (fast, direct)
- subscription: Uses ClaudeSDKClient with CLI credentials
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class NewsSummarizer:
    """Summarizes news articles and analyzes sentiment using Claude."""

    def __init__(self, api_key: str = "", use_sdk: bool = False) -> None:
        self._use_sdk = use_sdk
        self._client: Any | None = None
        if api_key and not use_sdk:
            from anthropic import Anthropic

            self._client = Anthropic(api_key=api_key)

    @classmethod
    async def create(cls) -> "NewsSummarizer":
        """Create a summarizer with the correct auth mode."""
        from app.agent.auth import resolve_anthropic_api_key

        api_key = await resolve_anthropic_api_key()
        if api_key:
            return cls(api_key=api_key)
        logger.info("NewsSummarizer using Agent SDK (subscription mode)")
        return cls(use_sdk=True)

    async def _call_claude(self, prompt: str, max_tokens: int = 500) -> str:
        """Unified Claude call — uses raw API or SDK depending on mode."""
        if self._client:
            response = self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        return await self._call_via_sdk(prompt, max_tokens)

    async def _call_via_sdk(self, prompt: str, max_tokens: int) -> str:
        """Call Claude via the Agent SDK (subscription mode)."""
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, TextBlock

        from app.agent.auth import resolve_anthropic_api_key
        from app.agent.constants import SUPPRESS_CLI_HOOKS
        from app.agent.trading_agent import DISALLOWED_BUILTIN_TOOLS
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
        api_key = await resolve_anthropic_api_key()

        options = ClaudeAgentOptions(
            system_prompt="You are a concise financial news analyst. Respond only with what is asked.",
            model=app_settings.agent_model or "claude-sonnet-4-6",
            max_turns=1,
            permission_mode="bypassPermissions",
            disallowed_tools=DISALLOWED_BUILTIN_TOOLS,
            extra_args=SUPPRESS_CLI_HOOKS,
        )
        if api_key:
            options.env["ANTHROPIC_API_KEY"] = api_key

        client = ClaudeSDKClient(options=options)
        await client.connect()
        try:
            text_parts: list[str] = []
            await client.query(prompt)
            async for message in client.receive_response():
                for block in getattr(message, "content", []):
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
            return "".join(text_parts).strip()
        finally:
            await client.disconnect()

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

        summary = await self._call_claude(prompt, max_tokens=500)
        return summary[: max_length - 3] + "..." if len(summary) > max_length else summary

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

        response_text = await self._call_claude(prompt, max_tokens=500)
        return self._parse_sentiment_response(response_text)

    def _parse_sentiment_response(self, response: str) -> dict[str, Any]:
        """Parse sentiment analysis response."""
        result: dict[str, Any] = {
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
        assets: list[str] | None = None,
    ) -> float:
        """Analyze how relevant an article is for trading."""
        truncated_content = content[:3000] if len(content) > 3000 else content

        assets_text = f"\nSpecific assets of interest: {', '.join(assets)}" if assets else ""

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

        response_text = await self._call_claude(prompt, max_tokens=50)
        try:
            score = float(response_text)
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
