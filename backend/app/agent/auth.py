"""Shared API key resolution for the trading agent and subagents."""

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


async def resolve_anthropic_api_key() -> str:
    """Return the effective Anthropic API key.

    Resolution order:
    1. Encrypted value from AppSettings in DB (``get_agent_api_key()``)
    2. ``ANTHROPIC_API_KEY`` environment variable (via Settings)
    3. Empty string — the Agent SDK will use Claude Code CLI credentials

    This helper is used by *TradingAgent* and all subagents so they share
    the same key-resolution logic.
    """
    from app.db.models.app_settings import AppSettings

    settings = get_settings()

    try:
        app_settings = await AppSettings.get_instance()
        db_key = app_settings.get_agent_api_key()
        if db_key:
            return db_key
    except Exception:
        logger.debug("Could not load AppSettings for API key resolution", exc_info=True)

    return settings.anthropic_api_key
