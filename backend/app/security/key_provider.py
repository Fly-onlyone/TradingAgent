"""Load encryption keys from OS keyring (desktop) or settings (server)."""

from __future__ import annotations

import logging
import os
from typing import Final

from app.config import APP_ENV_FILE_ENV_VAR, get_settings

logger = logging.getLogger(__name__)

_KEYS_ENV_VAR: Final[str] = "SECRETS_ENCRYPTION_KEYS"


class SecretKeyProviderError(RuntimeError):
    """Raised when encryption keys cannot be loaded."""


def _parse_keys(raw: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _is_desktop_app() -> bool:
    return bool(os.environ.get("TAURI_APP"))


def _try_keyring_load() -> str | None:
    """Attempt to load keys from OS keyring (desktop only)."""
    if not _is_desktop_app():
        return None
    from app.security.keyring_store import load_from_keyring

    return load_from_keyring()


def _try_keyring_save(keys_raw: str) -> bool:
    """Attempt to save keys to OS keyring (desktop only)."""
    if not _is_desktop_app():
        return False
    from app.security.keyring_store import save_to_keyring

    return save_to_keyring(keys_raw)


def _migrate_env_to_keyring(keys_raw: str) -> None:
    """Migrate key from .env file to OS keyring, then comment out the .env line."""
    if not _try_keyring_save(keys_raw):
        return  # Keyring unavailable — keep using .env

    env_path = os.environ.get(APP_ENV_FILE_ENV_VAR)
    if env_path:
        from app.security.keyring_store import remove_encryption_key_from_env_file

        remove_encryption_key_from_env_file(env_path)

    logger.info("Migrated encryption key from .env to OS keyring")


def load_encryption_keys() -> tuple[str, ...]:
    """Load encryption keys with priority: keyring > settings > empty.

    For desktop apps (TAURI_APP=1):
      1. Try OS keyring first
      2. Fall back to settings (env var / .env)
      3. If found in settings but not keyring, migrate to keyring

    For server deployments:
      Load from settings only (unchanged behavior).
    """
    # Desktop: try keyring first
    if _is_desktop_app():
        keyring_raw = _try_keyring_load()
        if keyring_raw:
            keys = _parse_keys(keyring_raw)
            if keys:
                logger.info("Loaded %d encryption key(s) from OS keyring", len(keys))
                return keys

    # Fall back to settings (env var / .env file)
    settings = get_settings()
    settings_raw = settings.secrets_encryption_keys
    keys = _parse_keys(settings_raw)

    # Desktop: if found in settings but not in keyring, migrate
    if keys and _is_desktop_app():
        _migrate_env_to_keyring(settings_raw)

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
