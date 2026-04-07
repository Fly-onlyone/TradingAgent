"""Tests for AppSettings secret migration and accessors."""

from __future__ import annotations

import pytest
from app.db.models.app_settings import AppSettings
from app.security.secrets_crypto import SecretDecryptionError


@pytest.mark.asyncio
async def test_migrate_plaintext_secrets_if_needed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = AppSettings.model_construct(
        agent_api_key="plain-agent",
        okx_api_key="plain-okx",
        okx_secret_key="",
        okx_passphrase="",
    )

    saved = {"called": False}

    async def _save_with_timestamp(self: AppSettings) -> None:
        assert self is settings
        saved["called"] = True

    monkeypatch.setattr(AppSettings, "save_with_timestamp", _save_with_timestamp)
    monkeypatch.setattr("app.db.models.app_settings.is_encrypted_secret", lambda _: False)
    monkeypatch.setattr(
        "app.db.models.app_settings.encrypt_secret_value",
        lambda value: f"enc:v1:{value}",
    )

    migrated = await settings.migrate_plaintext_secrets_if_needed()

    assert migrated is True
    assert saved["called"] is True
    assert settings.agent_api_key == "enc:v1:plain-agent"
    assert settings.okx_api_key == "enc:v1:plain-okx"


def test_get_agent_api_key_decrypts(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = AppSettings.model_construct(agent_api_key="enc:v1:token")
    monkeypatch.setattr("app.db.models.app_settings.decrypt_secret_value", lambda _: "clear")

    assert settings.get_agent_api_key() == "clear"


def test_validate_decryptable_secrets_raises_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = AppSettings.model_construct(agent_api_key="enc:v1:token")
    monkeypatch.setattr("app.db.models.app_settings.is_encrypted_secret", lambda _: True)

    def _raise(_: str, *, log_errors: bool = True) -> str:
        del log_errors
        raise SecretDecryptionError("boom")

    monkeypatch.setattr("app.db.models.app_settings.decrypt_secret_value", _raise)

    with pytest.raises(RuntimeError):
        settings.validate_decryptable_secrets()


def test_get_undecryptable_secret_fields_returns_only_invalid_entries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = AppSettings.model_construct(
        agent_api_key="enc:v1:agent",
        okx_api_key="enc:v1:broken",
        okx_secret_key="",
    )

    def _decrypt(value: str, *, log_errors: bool = True) -> str:
        del log_errors
        if value.endswith("broken"):
            raise SecretDecryptionError("boom")
        return "clear"

    monkeypatch.setattr("app.db.models.app_settings.decrypt_secret_value", _decrypt)

    assert settings.get_undecryptable_secret_fields() == ["okx_api_key"]


@pytest.mark.asyncio
async def test_clear_secret_fields_clears_only_requested_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = AppSettings.model_construct(
        agent_api_key="enc:v1:agent",
        okx_api_key="enc:v1:okx",
        okx_secret_key="enc:v1:secret",
    )

    saved = {"called": False}

    async def _save_with_timestamp(self: AppSettings) -> None:
        assert self is settings
        saved["called"] = True

    monkeypatch.setattr(AppSettings, "save_with_timestamp", _save_with_timestamp)

    cleared = await settings.clear_secret_fields(("okx_api_key", "missing_field"))

    assert cleared == ["okx_api_key"]
    assert saved["called"] is True
    assert settings.agent_api_key == "enc:v1:agent"
    assert settings.okx_api_key == ""
    assert settings.okx_secret_key == "enc:v1:secret"
