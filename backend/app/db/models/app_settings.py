"""Singleton application settings stored in MongoDB."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import ClassVar

from beanie import Document
from pydantic import Field

from app.security.secrets_crypto import (
    SecretDecryptionError,
    encrypt_secret_value,
    decrypt_secret_value,
    is_encrypted_secret,
)

logger = logging.getLogger(__name__)


class AgentAuthMode(str, Enum):
    """Authentication mode for the Claude Agent SDK."""

    SUBSCRIPTION = "subscription"  # Claude Pro/Max via `claude login`
    API_KEY = "api_key"  # Direct Anthropic API key


class AppSettings(Document):
    """Singleton document for runtime application settings.

    Only one document should exist. Use get_instance() to retrieve it.
    """

    SECRET_FIELD_NAMES: ClassVar[tuple[str, ...]] = (
        "agent_api_key",
        "okx_api_key",
        "okx_secret_key",
        "okx_passphrase",
    )

    # Agent configuration
    agent_auth_mode: AgentAuthMode = AgentAuthMode.SUBSCRIPTION
    agent_api_key: str = ""  # Encrypted/stored API key (empty = use env var)
    agent_model: str = "claude-sonnet-4-20250514"
    agent_max_thinking_tokens: int = 10000

    # OKX Exchange configuration
    okx_api_key: str = ""
    okx_secret_key: str = ""
    okx_passphrase: str = ""
    okx_sandbox: bool = True

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

        migrated = await instance.migrate_plaintext_secrets_if_needed()
        if migrated:
            logger.info(
                "Migrated legacy plaintext app settings secrets to encrypted format"
            )

        return instance

    async def save_changes(self) -> None:
        """Save with updated timestamp."""
        self.updated_at = datetime.now(timezone.utc)
        await self.save()

    def _get_secret_value(self, field_name: str) -> str:
        value = getattr(self, field_name)
        if not value:
            return ""
        return decrypt_secret_value(value)

    def _set_secret_value(self, field_name: str, value: str) -> None:
        if not value:
            setattr(self, field_name, "")
            return
        setattr(self, field_name, encrypt_secret_value(value))

    def get_agent_api_key(self) -> str:
        """Get decrypted agent API key."""
        return self._get_secret_value("agent_api_key")

    def get_okx_api_key(self) -> str:
        """Get decrypted OKX API key."""
        return self._get_secret_value("okx_api_key")

    def get_okx_secret_key(self) -> str:
        """Get decrypted OKX secret key."""
        return self._get_secret_value("okx_secret_key")

    def get_okx_passphrase(self) -> str:
        """Get decrypted OKX passphrase."""
        return self._get_secret_value("okx_passphrase")

    def set_agent_api_key(self, value: str) -> None:
        """Set agent API key in encrypted storage format."""
        self._set_secret_value("agent_api_key", value)

    def set_okx_api_key(self, value: str) -> None:
        """Set OKX API key in encrypted storage format."""
        self._set_secret_value("okx_api_key", value)

    def set_okx_secret_key(self, value: str) -> None:
        """Set OKX secret key in encrypted storage format."""
        self._set_secret_value("okx_secret_key", value)

    def set_okx_passphrase(self, value: str) -> None:
        """Set OKX passphrase in encrypted storage format."""
        self._set_secret_value("okx_passphrase", value)

    def has_persisted_secret_values(self) -> bool:
        """Return True when any secret field has a non-empty stored value."""
        return any(
            bool(getattr(self, field_name)) for field_name in self.SECRET_FIELD_NAMES
        )

    def has_encrypted_secret_values(self) -> bool:
        """Return True when at least one stored secret uses encrypted marker format."""
        return any(
            is_encrypted_secret(getattr(self, field_name))
            for field_name in self.SECRET_FIELD_NAMES
            if getattr(self, field_name)
        )

    async def migrate_plaintext_secrets_if_needed(self) -> bool:
        """Encrypt legacy plaintext secrets in-place when found."""
        changed = False
        for field_name in self.SECRET_FIELD_NAMES:
            value = getattr(self, field_name)
            if value and not is_encrypted_secret(value):
                setattr(self, field_name, encrypt_secret_value(value))
                changed = True

        if changed:
            await self.save_changes()

        return changed

    def validate_decryptable_secrets(self) -> None:
        """Validate that encrypted values can be decrypted with current key set."""
        for field_name in self.SECRET_FIELD_NAMES:
            value = getattr(self, field_name)
            if not value or not is_encrypted_secret(value):
                continue
            try:
                decrypt_secret_value(value)
            except SecretDecryptionError as exc:
                raise RuntimeError(
                    "Encrypted app settings secret cannot be decrypted: "
                    f"field={field_name}."
                ) from exc
