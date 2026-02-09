"""Singleton application settings stored in MongoDB."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field


class AgentAuthMode(str, Enum):
    """Authentication mode for the Claude Agent SDK."""

    SUBSCRIPTION = "subscription"  # Claude Pro/Max via `claude login`
    API_KEY = "api_key"  # Direct Anthropic API key


class AppSettings(Document):
    """Singleton document for runtime application settings.

    Only one document should exist. Use get_instance() to retrieve it.
    """

    # Agent configuration
    agent_auth_mode: AgentAuthMode = AgentAuthMode.SUBSCRIPTION
    agent_api_key: str = ""  # Encrypted/stored API key (empty = use env var)
    agent_model: str = "claude-sonnet-4-20250514"
    agent_max_thinking_tokens: int = 10000

    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "app_settings"

    @classmethod
    async def get_instance(cls) -> "AppSettings":
        """Get or create the singleton settings document."""
        instance = await cls.find_one()
        if not instance:
            instance = cls()
            await instance.insert()
        return instance

    async def save_changes(self) -> None:
        """Save with updated timestamp."""
        self.updated_at = datetime.now(timezone.utc)
        await self.save()
