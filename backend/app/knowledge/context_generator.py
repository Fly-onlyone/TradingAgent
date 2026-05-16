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
    model: str | None = None,
) -> str | None:
    """Generate a contextual prefix using the currently configured provider.

    Returns a 1-2 sentence prefix or None if generation fails.

    ``model`` overrides the active provider's default. When omitted, uses
    Claude Haiku for Anthropic and the active OpenAI family otherwise.
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
        from app.agent.auth import resolve_active_provider_api_key

        provider, api_key = await resolve_active_provider_api_key()
        if not api_key:
            logger.debug("No API key available for context generation (provider=%s)", provider)
            return None

        if provider == "openai":
            return await _generate_openai(prompt, api_key, model)
        return await _generate_anthropic(prompt, api_key, model)
    except Exception:
        logger.warning("Context prefix generation failed", exc_info=True)

    return None


async def _generate_anthropic(prompt: str, api_key: str, model: str | None) -> str | None:
    """Run context generation against the Anthropic API."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model or "claude-haiku-4-5-20251001",
        max_tokens=150,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    if response.content and response.content[0].type == "text":
        prefix = response.content[0].text.strip()
        if len(prefix) > 500:
            prefix = prefix[:500]
        return prefix
    return None


async def _generate_openai(prompt: str, api_key: str, model: str | None) -> str | None:
    """Run context generation against the OpenAI Chat Completions API."""
    from openai import AsyncOpenAI

    from app.api.v1.settings import FAMILY_TO_API_MODEL, _normalize_to_family
    from app.db.models.app_settings import AppSettings

    app_settings = await AppSettings.get_instance()
    family = _normalize_to_family(app_settings.agent_model)
    resolved = model or FAMILY_TO_API_MODEL.get(family, family) or "gpt-5.5"

    client = AsyncOpenAI(api_key=api_key)
    completion = await client.chat.completions.create(
        model=resolved,
        max_completion_tokens=150,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
    )
    choice = completion.choices[0] if completion.choices else None
    if not choice or not choice.message or not choice.message.content:
        return None
    prefix = choice.message.content.strip()
    if len(prefix) > 500:
        prefix = prefix[:500]
    return prefix
