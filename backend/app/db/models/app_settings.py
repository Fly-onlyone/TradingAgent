"""Singleton application settings stored in MongoDB."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from enum import Enum
from typing import Any, ClassVar

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel
from pymongo.errors import DuplicateKeyError

from app.security.secrets_crypto import (
    SecretDecryptionError,
    decrypt_secret_value,
    encrypt_secret_value,
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

    SINGLETON_KEY: ClassVar[str] = "app_settings"
    _cached_instance: ClassVar[AppSettings | None] = None
    SECRET_FIELD_NAMES: ClassVar[tuple[str, ...]] = (
        "agent_api_key",
        "okx_api_key",
        "okx_secret_key",
        "okx_passphrase",
        "brave_search_api_key",
    )

    singleton_key: str = SINGLETON_KEY

    # Agent configuration
    agent_auth_mode: AgentAuthMode = AgentAuthMode.SUBSCRIPTION
    agent_api_key: str = ""  # Encrypted/stored API key (empty = use env var)
    agent_model: str = "sonnet"
    agent_thinking_mode: str = "adaptive"  # "adaptive", "enabled", "disabled"
    agent_thinking_budget: int = 10000  # Token budget when mode is "enabled"
    agent_effort: str = "high"  # "low", "medium", "high", "max"

    # OKX Exchange configuration
    okx_api_key: str = ""
    okx_secret_key: str = ""
    okx_passphrase: str = ""
    okx_sandbox: bool = True

    # Brave Search configuration
    brave_search_api_key: str = ""

    # Auth / token settings
    access_token_expire_minutes: int = 0  # 0 = use env var fallback, then no expiry

    # Embedding model selection
    embedding_model_name: str = "nomic-ai/nomic-embed-text-v1.5"

    # Embedding task deferral — pause CPU-heavy embedding when gaming
    defer_embedding_when_gaming: bool = False
    gaming_process_list: list[str] = []  # e.g. ["cs2.exe", "valorant.exe"]
    gaming_check_interval_minutes: int = 3

    # Chat session retention
    session_retention_days: int = 0  # 0 = keep forever
    session_cleanup_last_run_at: datetime | None = None

    # Strategy auto-discovery from news sources
    auto_discover_enabled: bool = False
    auto_discover_interval_hours: int = 6
    auto_discover_min_confidence: float = 0.5
    auto_discover_max_sources: int = 30
    auto_discover_last_run_at: datetime | None = None

    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "app_settings"
        indexes = [
            IndexModel(
                [("singleton_key", ASCENDING)],
                name="app_settings_singleton_unique",
                unique=True,
                partialFilterExpression={"singleton_key": "app_settings"},
            )
        ]

    @classmethod
    def _instance_sort_key(cls, instance: AppSettings) -> tuple[datetime, str]:
        updated = instance.updated_at
        if updated.tzinfo is None or updated.utcoffset() is None:
            updated = updated.replace(tzinfo=UTC)
        return updated, str(instance.id)

    @classmethod
    async def _archive_conflicting_instance(
        cls,
        canonical_id: Any,
        instance: AppSettings,
    ) -> None:
        archive_collection = cls.get_pymongo_collection().database["app_settings_conflicts"]
        archived_doc = instance.model_dump(mode="python")
        archived_doc.pop("id", None)
        archived_doc["original_id"] = instance.id
        archived_doc["canonical_id"] = canonical_id
        archived_doc["archived_at"] = datetime.now(UTC)
        await archive_collection.insert_one(archived_doc)

    @classmethod
    async def ensure_singleton_document(cls) -> AppSettings:
        """Ensure only one settings document exists and return it."""
        instances = await cls.find_all().to_list()

        if not instances:
            instance = cls()
            try:
                await instance.insert()
                return instance
            except DuplicateKeyError:
                # Another process created it concurrently.
                existing = await cls.find_one({"singleton_key": cls.SINGLETON_KEY})
                if existing:
                    return existing
                raise

        canonical = max(instances, key=cls._instance_sort_key)
        canonical_changed = False

        if (
            "singleton_key" not in canonical.model_fields_set
            or canonical.singleton_key != cls.SINGLETON_KEY
        ):
            canonical.singleton_key = cls.SINGLETON_KEY
            canonical_changed = True

        duplicates: list[AppSettings] = []
        for instance in instances:
            if instance.id == canonical.id:
                continue
            duplicates.append(instance)
            for field_name in cls.SECRET_FIELD_NAMES:
                incoming_value = getattr(instance, field_name)
                if incoming_value and not getattr(canonical, field_name):
                    setattr(canonical, field_name, incoming_value)
                    canonical_changed = True

        if canonical_changed:
            await canonical.save_with_timestamp()

        for duplicate in duplicates:
            await cls._archive_conflicting_instance(canonical.id, duplicate)
            await duplicate.delete()

        return canonical

    @classmethod
    async def get_instance(cls) -> AppSettings:
        """Get or create the singleton settings document."""
        instance = await cls.ensure_singleton_document()

        migrated = await instance.migrate_plaintext_secrets_if_needed()
        if migrated:
            logger.info("Migrated legacy plaintext app settings secrets to encrypted format")

        cls._cached_instance = instance
        return instance

    async def save_with_timestamp(self) -> None:
        """Persist settings and refresh updated_at."""
        self.updated_at = datetime.now(UTC)
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

    def get_brave_search_api_key(self) -> str:
        """Get decrypted Brave Search API key."""
        return self._get_secret_value("brave_search_api_key")

    def set_brave_search_api_key(self, value: str) -> None:
        """Set Brave Search API key in encrypted storage format."""
        self._set_secret_value("brave_search_api_key", value)

    def has_persisted_secret_values(self) -> bool:
        """Return True when any secret field has a non-empty stored value."""
        return any(bool(getattr(self, field_name)) for field_name in self.SECRET_FIELD_NAMES)

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
            await self.save_with_timestamp()

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
                    f"Encrypted app settings secret cannot be decrypted: field={field_name}."
                ) from exc
