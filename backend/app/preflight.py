"""Packaged desktop startup checks."""

from __future__ import annotations

import asyncio
import os
from dataclasses import asdict, dataclass

from app.config import APP_ENV_FILE_ENV_VAR, get_settings
from app.db.session import _ensure_mongodb_running

_PLACEHOLDER_SECRET_KEYS = {"", "change-me-in-production"}


@dataclass(slots=True)
class PreflightResult:
    ok: bool
    code: str = ""
    message: str = ""
    detail: str = ""

    def to_dict(self) -> dict[str, str | bool]:
        """Return a JSON-serializable result payload."""
        return asdict(self)


def _failure(code: str, message: str, detail: str = "") -> PreflightResult:
    return PreflightResult(
        ok=False,
        code=code,
        message=message,
        detail=detail,
    )


def validate_packaged_env_file(env_path: str | None, secret_key: str) -> PreflightResult:
    """Validate the desktop env file seeded by the Tauri runtime."""
    if not env_path:
        return _failure(
            "missing_app_env_file",
            "APP_ENV_FILE is not set for the packaged desktop backend.",
            "The desktop shell should point the backend to its seeded .env file.",
        )

    if not os.path.exists(env_path):
        return _failure(
            "missing_app_env_file",
            "The packaged desktop .env file does not exist.",
            env_path,
        )

    try:
        with open(env_path, encoding="utf-8") as env_file:
            content = env_file.read()
    except OSError as exc:
        return _failure(
            "unreadable_app_env_file",
            "The packaged desktop .env file could not be read.",
            f"{env_path}: {exc}",
        )

    if secret_key in _PLACEHOLDER_SECRET_KEYS:
        return _failure(
            "invalid_secret_key",
            "The packaged desktop backend resolved an invalid SECRET_KEY.",
            "A stable, non-placeholder SECRET_KEY is required for desktop auth tokens.",
        )

    persisted_secret_key = ""
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("SECRET_KEY="):
            persisted_secret_key = line.partition("=")[2].strip()
            break

    if persisted_secret_key in _PLACEHOLDER_SECRET_KEYS:
        return _failure(
            "unpersisted_secret_key",
            "The packaged desktop .env file does not contain a persisted SECRET_KEY.",
            env_path,
        )

    return PreflightResult(ok=True)


def run_packaged_preflight() -> PreflightResult:
    """Validate packaged desktop prerequisites before starting uvicorn."""
    env_path = os.environ.get(APP_ENV_FILE_ENV_VAR)

    try:
        settings = get_settings()
    except Exception as exc:  # noqa: BLE001
        return _failure(
            "settings_load_failed",
            "The packaged desktop backend could not load its settings.",
            str(exc),
        )

    env_validation = validate_packaged_env_file(env_path, settings.secret_key)
    if not env_validation.ok:
        return env_validation

    try:
        asyncio.run(_ensure_mongodb_running())
    except RuntimeError as exc:
        return _failure(
            "mongodb_unavailable",
            "MongoDB is not reachable for the packaged desktop backend.",
            str(exc),
        )
    except Exception as exc:  # noqa: BLE001
        return _failure(
            "mongodb_preflight_failed",
            "The packaged desktop backend hit an unexpected MongoDB preflight failure.",
            str(exc),
        )

    return PreflightResult(ok=True)
