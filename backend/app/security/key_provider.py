"""Load encryption keys from settings."""

from __future__ import annotations

import logging
from typing import Final

from app.config import get_settings

logger = logging.getLogger(__name__)

_KEYS_ENV_VAR: Final[str] = "SECRETS_ENCRYPTION_KEYS"


class SecretKeyProviderError(RuntimeError):
    """Raised when encryption keys cannot be loaded."""


def _parse_keys(raw: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def load_encryption_keys() -> tuple[str, ...]:
    """Load encryption keys from direct config."""
    settings = get_settings()
    keys = _parse_keys(settings.secrets_encryption_keys)
    logger.info("Loaded %d encryption key(s)", len(keys))
    return keys


def get_required_encryption_keys() -> tuple[str, ...]:
    """Return encryption keys or raise a descriptive configuration error."""
    keys = load_encryption_keys()
    if keys:
        return keys

    logger.error("No encryption keys configured — secret storage is unavailable")
    raise SecretKeyProviderError(
        "No encryption keys configured. Set `SECRETS_ENCRYPTION_KEYS` "
        "(comma-separated Fernet keys)."
    )


def clear_key_cache() -> None:
    """Key cache hook for compatibility with crypto cache lifecycle."""
    return None
