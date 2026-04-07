"""Tests for encryption key loading and validation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from app.security import key_provider
from app.security.key_provider import SecretKeyProviderError


def _settings(keys: str = "") -> SimpleNamespace:
    return SimpleNamespace(secrets_encryption_keys=keys)


# -- Server mode (no TAURI_APP) — original behavior ---------------------------


def test_load_encryption_keys_from_direct_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key_provider.clear_key_cache()
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("k1, k2"))
    monkeypatch.delenv("TAURI_APP", raising=False)

    keys = key_provider.load_encryption_keys()

    assert keys == ("k1", "k2")


def test_get_required_encryption_keys_raises_without_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key_provider.clear_key_cache()
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings())
    monkeypatch.delenv("TAURI_APP", raising=False)

    with pytest.raises(SecretKeyProviderError):
        key_provider.get_required_encryption_keys()


def test_skips_keyring_for_server(monkeypatch: pytest.MonkeyPatch) -> None:
    """Server deployments should never consult keyring."""
    key_provider.clear_key_cache()
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("server-key"))
    monkeypatch.delenv("TAURI_APP", raising=False)

    with patch("app.security.keyring_store.load_from_keyring") as mock_load:
        keys = key_provider.load_encryption_keys()

    mock_load.assert_not_called()
    assert keys == ("server-key",)


# -- Desktop mode (TAURI_APP=1) -----------------------------------------------


def test_load_prefers_keyring_for_desktop(monkeypatch: pytest.MonkeyPatch) -> None:
    """Desktop should use keyring value when available."""
    key_provider.clear_key_cache()
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("env-key"))

    with patch("app.security.keyring_store.load_from_keyring", return_value="keyring-key"):
        keys = key_provider.load_encryption_keys()

    assert keys == ("keyring-key",)


def test_falls_back_to_settings_when_keyring_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Desktop falls back to settings when keyring is empty."""
    key_provider.clear_key_cache()
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("env-key"))
    monkeypatch.delenv("APP_ENV_FILE", raising=False)

    with (
        patch("app.security.keyring_store.load_from_keyring", return_value=None),
        patch("app.security.keyring_store.save_to_keyring", return_value=True) as mock_save,
        patch("app.security.keyring_store.remove_encryption_key_from_env_file"),
    ):
        keys = key_provider.load_encryption_keys()

    assert keys == ("env-key",)
    mock_save.assert_called_once_with("env-key")


def test_migrates_env_to_keyring(monkeypatch: pytest.MonkeyPatch) -> None:
    """Desktop migrates .env key to keyring and comments out the .env line."""
    key_provider.clear_key_cache()
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.setenv("APP_ENV_FILE", "/fake/.env")
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("migrate-me"))

    with (
        patch("app.security.keyring_store.load_from_keyring", return_value=None),
        patch("app.security.keyring_store.save_to_keyring", return_value=True) as mock_save,
        patch("app.security.keyring_store.remove_encryption_key_from_env_file") as mock_remove,
    ):
        keys = key_provider.load_encryption_keys()

    assert keys == ("migrate-me",)
    mock_save.assert_called_once_with("migrate-me")
    mock_remove.assert_called_once_with("/fake/.env")


def test_keyring_failure_falls_back_to_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Desktop falls back gracefully when keyring raises."""
    key_provider.clear_key_cache()
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("fallback-key"))
    monkeypatch.delenv("APP_ENV_FILE", raising=False)

    with (
        patch("app.security.keyring_store.load_from_keyring", return_value=None),
        patch("app.security.keyring_store.save_to_keyring", return_value=False),
    ):
        keys = key_provider.load_encryption_keys()

    assert keys == ("fallback-key",)
