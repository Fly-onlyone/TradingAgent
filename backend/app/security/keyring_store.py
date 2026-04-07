"""OS keyring storage for encryption keys (desktop app only)."""

from __future__ import annotations

import logging
import os
import re
from typing import Final

logger = logging.getLogger(__name__)

SERVICE_NAME: Final[str] = "trading-agent"
KEYRING_ACCOUNT: Final[str] = "secrets-encryption-keys"


def _get_keyring():  # noqa: ANN202
    """Lazy-import keyring to avoid import errors on systems without backends."""
    try:
        import keyring

        return keyring
    except ImportError:
        return None


def load_from_keyring() -> str | None:
    """Load encryption keys from OS keyring. Returns None if unavailable."""
    kr = _get_keyring()
    if kr is None:
        logger.debug("keyring library not available")
        return None
    try:
        value = kr.get_password(SERVICE_NAME, KEYRING_ACCOUNT)
        if value:
            logger.info("Loaded encryption key(s) from OS keyring")
        return value
    except Exception:
        logger.warning("Failed to read from OS keyring", exc_info=True)
        return None


def save_to_keyring(keys_raw: str) -> bool:
    """Store encryption keys in OS keyring. Returns True on success."""
    kr = _get_keyring()
    if kr is None:
        logger.warning("keyring library not available; cannot store key")
        return False
    try:
        kr.set_password(SERVICE_NAME, KEYRING_ACCOUNT, keys_raw)
        logger.info("Stored encryption key(s) in OS keyring")
        return True
    except Exception:
        logger.warning("Failed to write to OS keyring", exc_info=True)
        return False


def delete_from_keyring() -> bool:
    """Remove encryption keys from OS keyring. Returns True on success."""
    kr = _get_keyring()
    if kr is None:
        return False
    try:
        kr.delete_password(SERVICE_NAME, KEYRING_ACCOUNT)
        return True
    except Exception:
        return False


def remove_encryption_key_from_env_file(env_path: str) -> bool:
    """Comment out the SECRETS_ENCRYPTION_KEYS line in a .env file after migration."""
    if not env_path or not os.path.exists(env_path):
        return False
    try:
        with open(env_path, encoding="utf-8") as f:
            content = f.read()

        new_content = re.sub(
            r"(?m)^(SECRETS_ENCRYPTION_KEYS\s*=.*)$",
            r"# Migrated to OS keyring\n# \1",
            content,
        )
        if new_content == content:
            return False

        with open(env_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        logger.info(
            "Commented out SECRETS_ENCRYPTION_KEYS from %s (migrated to OS keyring)",
            env_path,
        )
        return True
    except OSError:
        logger.warning("Failed to clean SECRETS_ENCRYPTION_KEYS from env file", exc_info=True)
        return False
