"""Tests for packaged desktop preflight checks."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.preflight import run_packaged_preflight, validate_packaged_env_file


def test_validate_packaged_env_file_requires_existing_path(tmp_path: Path) -> None:
    result = validate_packaged_env_file(str(tmp_path / ".env"), "stable-secret")

    assert result.ok is False
    assert result.code == "missing_app_env_file"


def test_validate_packaged_env_file_requires_persisted_secret(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("SECRET_KEY=\n", encoding="utf-8")

    result = validate_packaged_env_file(str(env_file), "stable-secret")

    assert result.ok is False
    assert result.code == "unpersisted_secret_key"


def test_run_packaged_preflight_reports_mongodb_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("SECRET_KEY=stable-secret\n", encoding="utf-8")

    monkeypatch.setenv("APP_ENV_FILE", str(env_file))
    monkeypatch.setattr(
        "app.preflight.get_settings",
        lambda: type("SettingsStub", (), {"secret_key": "stable-secret"})(),
    )

    async def _raise_mongodb() -> None:
        raise RuntimeError("MongoDB service unavailable")

    monkeypatch.setattr("app.preflight._ensure_mongodb_running", _raise_mongodb)

    result = run_packaged_preflight()

    assert result.ok is False
    assert result.code == "mongodb_unavailable"
