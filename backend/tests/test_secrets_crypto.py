"""Tests for secret encryption and decryption helpers."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from app.security import secrets_crypto
from app.security.secrets_crypto import SecretDecryptionError


@pytest.fixture(autouse=True)
def _clear_crypto_cache() -> None:
    secrets_crypto.clear_crypto_cache()


def test_encrypt_decrypt_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setattr(secrets_crypto, "get_required_encryption_keys", lambda: (key,))

    encrypted = secrets_crypto.encrypt_secret_value("top-secret")

    assert encrypted.startswith(secrets_crypto.SECRET_ENCRYPTION_PREFIX)
    assert secrets_crypto.decrypt_secret_value(encrypted) == "top-secret"


def test_decrypt_plaintext_passthrough() -> None:
    assert secrets_crypto.decrypt_secret_value("legacy-plaintext") == "legacy-plaintext"


def test_decrypt_raises_for_invalid_encrypted_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setattr(secrets_crypto, "get_required_encryption_keys", lambda: (key,))

    with pytest.raises(SecretDecryptionError):
        secrets_crypto.decrypt_secret_value(
            f"{secrets_crypto.SECRET_ENCRYPTION_PREFIX}invalid"
        )
