"""Tests for OS keyring storage module."""

from __future__ import annotations

import pytest
from app.security import keyring_store


class FakeKeyring:
    """In-memory keyring mock."""

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, account: str) -> str | None:
        return self._store.get((service, account))

    def set_password(self, service: str, account: str, password: str) -> None:
        self._store[(service, account)] = password

    def delete_password(self, service: str, account: str) -> None:
        self._store.pop((service, account), None)


class BrokenKeyring:
    """Keyring that always raises."""

    def get_password(self, service: str, account: str) -> str:
        raise RuntimeError("keyring unavailable")

    def set_password(self, service: str, account: str, password: str) -> None:
        raise RuntimeError("keyring unavailable")

    def delete_password(self, service: str, account: str) -> None:
        raise RuntimeError("keyring unavailable")


# -- load_from_keyring ---------------------------------------------------------


def test_load_from_keyring_returns_stored_value(monkeypatch: pytest.MonkeyPatch) -> None:
    kr = FakeKeyring()
    kr.set_password(keyring_store.SERVICE_NAME, keyring_store.KEYRING_ACCOUNT, "my-key")
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: kr)

    assert keyring_store.load_from_keyring() == "my-key"


def test_load_from_keyring_returns_none_when_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: FakeKeyring())

    assert keyring_store.load_from_keyring() is None


def test_load_from_keyring_returns_none_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: BrokenKeyring())

    assert keyring_store.load_from_keyring() is None


def test_load_from_keyring_returns_none_when_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: None)

    assert keyring_store.load_from_keyring() is None


# -- save_to_keyring -----------------------------------------------------------


def test_save_and_load_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    kr = FakeKeyring()
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: kr)

    assert keyring_store.save_to_keyring("test-key") is True
    assert keyring_store.load_from_keyring() == "test-key"


def test_save_to_keyring_returns_false_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: BrokenKeyring())

    assert keyring_store.save_to_keyring("test-key") is False


def test_save_to_keyring_returns_false_when_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: None)

    assert keyring_store.save_to_keyring("test-key") is False


# -- delete_from_keyring -------------------------------------------------------


def test_delete_from_keyring(monkeypatch: pytest.MonkeyPatch) -> None:
    kr = FakeKeyring()
    kr.set_password(keyring_store.SERVICE_NAME, keyring_store.KEYRING_ACCOUNT, "key")
    monkeypatch.setattr(keyring_store, "_get_keyring", lambda: kr)

    assert keyring_store.delete_from_keyring() is True
    assert keyring_store.load_from_keyring() is None


# -- remove_encryption_key_from_env_file ---------------------------------------


def test_remove_encryption_key_from_env_file(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "MONGODB_URL=mongodb://localhost\nSECRETS_ENCRYPTION_KEYS=abc123\nDEBUG=true\n",
        encoding="utf-8",
    )

    result = keyring_store.remove_encryption_key_from_env_file(str(env_file))

    assert result is True
    content = env_file.read_text(encoding="utf-8")
    assert "# Migrated to OS keyring" in content
    assert "# SECRETS_ENCRYPTION_KEYS=abc123" in content
    # The line should be commented out, not active
    lines = content.splitlines()
    for line in lines:
        if line.startswith("SECRETS_ENCRYPTION_KEYS="):
            pytest.fail("SECRETS_ENCRYPTION_KEYS line should be commented out")


def test_remove_encryption_key_from_env_file_no_key(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("MONGODB_URL=mongodb://localhost\n", encoding="utf-8")

    assert keyring_store.remove_encryption_key_from_env_file(str(env_file)) is False


def test_remove_encryption_key_from_env_file_missing_file() -> None:
    assert keyring_store.remove_encryption_key_from_env_file("/nonexistent/.env") is False
