"""Tests for encryption key loading and validation."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.security import key_provider
from app.security.key_provider import SecretKeyProviderError


def _settings(keys: str = "", ref: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        secrets_encryption_keys=keys, secrets_encryption_keys_ref=ref
    )


def test_load_encryption_keys_from_direct_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key_provider.clear_key_cache()
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings("k1, k2"))

    keys = key_provider.load_encryption_keys()

    assert keys == ("k1", "k2")


def test_load_encryption_keys_from_proton_ref(monkeypatch: pytest.MonkeyPatch) -> None:
    key_provider.clear_key_cache()
    monkeypatch.setattr(
        key_provider, "get_settings", lambda: _settings(ref="pass://vault/item/field")
    )
    monkeypatch.setattr(key_provider, "_resolve_with_pass_cli", lambda _: "k3,k4")

    keys = key_provider.load_encryption_keys()

    assert keys == ("k3", "k4")


def test_get_required_encryption_keys_raises_without_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key_provider.clear_key_cache()
    monkeypatch.setattr(key_provider, "get_settings", lambda: _settings())

    with pytest.raises(SecretKeyProviderError):
        key_provider.get_required_encryption_keys()
