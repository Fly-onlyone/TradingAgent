"""Generate contextual prefixes for documents before embedding (Anthropic-style contextual retrieval).

Prepends a 1-2 sentence context describing what the document is about,
improving embedding quality by 35-49% per Anthropic's research.
This is a write-time operation — context is generated once when documents are created.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# System prompt for context generation — kept short to minimize cost
_SYSTEM = (
    "You are a trading knowledge indexer. Given a document, write a 1-2 sentence "
    "contextual prefix that describes what the document is about, its key entities, "
    "and when it would be useful. Be specific about trading terms, assets, and conditions. "
    "Output ONLY the prefix, no other text."
)

# Prompt templates per knowledge type
_TEMPLATES: dict[str, str] = {
    "strategy": (
        "Write a contextual prefix for this trading strategy:\n\n"
        "Name: {name}\n"
        "Description: {description}\n"
        "Market conditions: {market_conditions}\n"
        "Assets: {asset_classes}\n"
        "Timeframes: {timeframes}"
    ),
    "lesson": (
        "Write a contextual prefix for this trade lesson:\n\n"
        "Trade: {side} {symbol} — {outcome} ({profit_pct:+.1f}%)\n"
        "Summary: {lesson_summary}\n"
        "Mistakes: {mistakes}\n"
        "Market context: {market_context}"
    ),
    "pattern": (
        "Write a contextual prefix for this trading pattern:\n\n"
        "Pattern: {pattern_name} ({pattern_type})\n"
        "Description: {description}\n"
        "Success rate: {success_rate}%, Samples: {sample_count}\n"
        "Symbols: {symbols}\n"
        "Market conditions: {market_conditions}"
    ),
    "news": (
        "Write a contextual prefix for this news article:\n\n"
        "Title: {title}\n"
        "Summary: {summary}\n"
        "Assets mentioned: {mentioned_assets}\n"
        "Sentiment: {sentiment_score}"
    ),
}


async def generate_context_prefix(
    doc_type: str,
    doc_data: dict[str, Any],
    model: str = "claude-haiku-4-5-20251001",
) -> str | None:
    """Generate a contextual prefix for a document using Claude.

    Returns a 1-2 sentence prefix or None if generation fails.
    """
    template = _TEMPLATES.get(doc_type)
    if not template:
        logger.warning("Unknown document type for context generation: %s", doc_type)
        return None

    try:
        # Safely format the template with defaults for missing fields
        safe_data = {k: (v if v is not None else "N/A") for k, v in doc_data.items()}
        # Handle list fields
        for key in (
            "market_conditions",
            "asset_classes",
            "timeframes",
            "symbols",
            "mentioned_assets",
            "mistakes",
            "successes",
            "recommendations",
        ):
            if key in safe_data and isinstance(safe_data[key], list):
                safe_data[key] = ", ".join(str(x) for x in safe_data[key])
        # Handle dict fields
        if isinstance(safe_data.get("market_context"), dict):
            safe_data["market_context"] = "; ".join(
                f"{k}: {v}" for k, v in safe_data["market_context"].items()
            )

        prompt = template.format_map(safe_data)
    except (KeyError, ValueError) as exc:
        logger.debug("Context prefix template formatting failed: %s", exc)
        return None

    try:
        from app.agent.auth import resolve_anthropic_api_key

        api_key = await resolve_anthropic_api_key()
        if not api_key:
            logger.debug("No API key available for context generation")
            return None

        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=150,
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )

        if response.content and response.content[0].type == "text":
            prefix = response.content[0].text.strip()
            # Sanity check: prefix should be short
            if len(prefix) > 500:
                prefix = prefix[:500]
            return prefix
    except Exception:
        logger.warning("Context prefix generation failed", exc_info=True)

    return None
