"""News summarizer using Claude or OpenAI for article summarization and sentiment.

Supports three modes:
- Anthropic + api_key: Raw Anthropic client (fast, direct)
- Anthropic + subscription: ClaudeSDKClient with CLI credentials
- OpenAI: AsyncOpenAI Chat Completions

The active model is read from ``AppSettings.agent_model`` so a provider
switch in the UI flips this service without redeploy.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class NewsSummarizer:
    """Summarizes news articles and analyzes sentiment using the configured provider."""

    def __init__(
        self,
        *,
        provider: str = "anthropic",
        api_key: str = "",
        use_sdk: bool = False,
    ) -> None:
        self._provider = provider
        self._use_sdk = use_sdk
        self._client: Any | None = None
        if provider == "openai" and api_key:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=api_key)
        elif provider == "anthropic" and api_key and not use_sdk:
            from anthropic import Anthropic

            self._client = Anthropic(api_key=api_key)

    @classmethod
    async def create(cls) -> "NewsSummarizer":
        """Create a summarizer wired to the currently selected provider."""
        from app.agent.auth import resolve_active_provider_api_key

        provider, api_key = await resolve_active_provider_api_key()
        if provider == "openai":
            if not api_key:
                # OpenAI has no subscription fallback — raise the moment we know.
                raise RuntimeError(
                    "OpenAI provider selected but no API key configured. "
                    "Set OPENAI_API_KEY or save a key via Settings → AI Agent."
                )
            return cls(provider="openai", api_key=api_key)

        if api_key:
            return cls(provider="anthropic", api_key=api_key)
        logger.info("NewsSummarizer using Agent SDK (subscription mode)")
        return cls(provider="anthropic", use_sdk=True)

    async def _resolved_model(self) -> str:
        """Map the selected family alias to a concrete API model id."""
        from app.api.v1.settings import (
            DEFAULT_MODEL_BY_FAMILY,
            FAMILY_TO_API_MODEL,
            _normalize_to_family,
        )
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
        family = _normalize_to_family(app_settings.agent_model)
        return (
            FAMILY_TO_API_MODEL.get(family)
            or DEFAULT_MODEL_BY_FAMILY.get(family)
            or app_settings.agent_model
            or ("gpt-5.5" if self._provider == "openai" else "claude-sonnet-4-6")
        )

    async def _call_claude(self, prompt: str, max_tokens: int = 500) -> str:
        """Unified call — dispatches to Anthropic or OpenAI based on provider."""
        if self._provider == "openai":
            return await self._call_via_openai(prompt, max_tokens)
        if self._client:
            model = await self._resolved_model()
            response = self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        return await self._call_via_sdk(prompt, max_tokens)

    async def _call_via_openai(self, prompt: str, max_tokens: int) -> str:
        """Call the OpenAI Chat Completions endpoint with the active model."""
        if self._client is None:  # safety net — create() always builds the client
            from app.agent.openai_client import build_openai_async_client

            self._client = await build_openai_async_client()
        model = await self._resolved_model()
        completion = await self._client.chat.completions.create(
            model=model,
            max_completion_tokens=max_tokens,
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise financial news analyst. Respond only with what is asked.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        choice = completion.choices[0] if completion.choices else None
        if not choice or not choice.message or not choice.message.content:
            return ""
        return choice.message.content.strip()

    async def _call_via_sdk(self, prompt: str, max_tokens: int) -> str:
        """Call Claude via the Agent SDK (subscription mode)."""
        _ = max_tokens  # SDK does not expose per-call token caps
        from app.agent.sdk_client import (
            build_sdk_client,
            claude_sdk_workload_slot,
            collect_text_response,
        )

        model = await self._resolved_model()
        client = await build_sdk_client(
            system_prompt="You are a concise financial news analyst. Respond only with what is asked.",
            model=model,
            stderr_source="NewsSummarizer",
        )
        await client.connect()
        try:
            async with claude_sdk_workload_slot("NewsSummarizer._call_via_sdk"):
                await client.query(prompt)
                return (await collect_text_response(client, source="NewsSummarizer")).strip()
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
