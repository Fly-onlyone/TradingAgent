"""Encrypt and decrypt app-managed secrets at rest."""

from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.security.key_provider import (
    SecretKeyProviderError,
    clear_key_cache,
    get_required_encryption_keys,
)

logger = logging.getLogger(__name__)

# Fernet uses AES-128-CBC with HMAC-SHA256 for authentication.
# If a compliance requirement mandates AES-256, introduce an "enc:v2:" scheme
# using AES-256-GCM (e.g. via cryptography.hazmat AESGCM) and keep v1 decryption
# for backwards compatibility during migration.
SECRET_ENCRYPTION_PREFIX = "enc:v1:"


class SecretEncryptionError(RuntimeError):
    """Raised when a secret cannot be encrypted due to configuration issues."""


class SecretDecryptionError(RuntimeError):
    """Raised when an encrypted secret cannot be decrypted."""


def is_encrypted_secret(value: str) -> bool:
    """Return True when a value is in encrypted marker format."""
    return bool(value) and value.startswith(SECRET_ENCRYPTION_PREFIX)


def _build_multifernet() -> MultiFernet:
    try:
        keys = get_required_encryption_keys()
    except SecretKeyProviderError as exc:
        raise SecretEncryptionError(str(exc)) from exc

    fernet_instances: list[Fernet] = []
    for key in keys:
        try:
            fernet_instances.append(Fernet(key.encode("utf-8")))
        except Exception as exc:  # noqa: BLE001 - normalize key errors
            raise SecretEncryptionError(
                "Invalid Fernet key configured for secret encryption."
            ) from exc

    return MultiFernet(fernet_instances)


@lru_cache(maxsize=1)
def _get_multifernet() -> MultiFernet:
    return _build_multifernet()


def clear_crypto_cache() -> None:
    """Clear in-memory crypto context and key cache."""
    _get_multifernet.cache_clear()
    clear_key_cache()


def encrypt_secret_value(value: str) -> str:
    """Encrypt plaintext for DB storage using enc:v1 marker format."""
    if not value:
        return ""

    try:
        token = _get_multifernet().encrypt(value.encode("utf-8")).decode("utf-8")
    except SecretEncryptionError:
        logger.error("Encryption failed — check key configuration")
        raise
    logger.debug("Secret value encrypted successfully")
    return f"{SECRET_ENCRYPTION_PREFIX}{token}"


def decrypt_secret_value(value: str) -> str:
    """Decrypt marker-formatted secret; passthrough plaintext legacy values."""
    if not value:
        return ""
    if not is_encrypted_secret(value):
        return value

    token = value.removeprefix(SECRET_ENCRYPTION_PREFIX)
    try:
        decrypted_bytes = _get_multifernet().decrypt(token.encode("utf-8"))
    except SecretEncryptionError as exc:
        logger.error("Decryption failed — key configuration error")
        raise SecretDecryptionError(str(exc)) from exc
    except InvalidToken as exc:
        logger.error("Decryption failed — invalid token or wrong key")
        raise SecretDecryptionError(
            "Failed to decrypt stored secret. The configured encryption keys "
            "may be missing, rotated out, or invalid."
        ) from exc

    logger.debug("Secret value decrypted successfully")
    return decrypted_bytes.decode("utf-8")
