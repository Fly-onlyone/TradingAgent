"""Load encryption keys from Proton Pass CLI or direct settings."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
from typing import Final

from app.config import get_settings

logger = logging.getLogger(__name__)

_KEYS_ENV_VAR: Final[str] = "SECRETS_ENCRYPTION_KEYS"
_KEYS_REF_ENV_VAR: Final[str] = "SECRETS_ENCRYPTION_KEYS_REF"
_RESOLVE_ENV_VAR: Final[str] = "APP_SECRETS_ENCRYPTION_KEYS"
_PASS_CLI_CANDIDATES: Final[tuple[str, ...]] = ("pass-cli", "pass")


class SecretKeyProviderError(RuntimeError):
    """Raised when encryption keys cannot be loaded."""


def _parse_keys(raw: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _resolve_with_pass_cli(reference: str) -> str:
    cli_binary = next(
        (name for name in _PASS_CLI_CANDIDATES if shutil.which(name)), None
    )
    if not cli_binary:
        raise SecretKeyProviderError(
            "Proton Pass CLI not found. Install `pass-cli` and authenticate first."
        )

    env = os.environ.copy()
    env[_RESOLVE_ENV_VAR] = reference

    command = [
        cli_binary,
        "run",
        "--no-masking",
        "--",
        sys.executable,
        "-c",
        f"import os; print(os.environ.get('{_RESOLVE_ENV_VAR}', ''))",
    ]

    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        env=env,
        timeout=20,
    )

    if completed.returncode != 0:
        error_output = (
            completed.stderr.strip() or completed.stdout.strip() or "unknown error"
        )
        raise SecretKeyProviderError(
            "Failed to resolve Proton Pass reference via CLI. "
            f"Reference={reference!r}; error={error_output}"
        )

    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def load_encryption_keys() -> tuple[str, ...]:
    """Load encryption keys from Proton Pass reference or direct config."""
    settings = get_settings()

    if settings.secrets_encryption_keys_ref:
        logger.info("Loading encryption keys via Proton Pass CLI reference")
        raw_value = _resolve_with_pass_cli(settings.secrets_encryption_keys_ref)
    else:
        raw_value = settings.secrets_encryption_keys

    keys = _parse_keys(raw_value)
    source = "Proton Pass" if settings.secrets_encryption_keys_ref else "direct config"
    logger.info("Loaded %d encryption key(s) from %s", len(keys), source)
    return keys


def get_required_encryption_keys() -> tuple[str, ...]:
    """Return encryption keys or raise a descriptive configuration error."""
    keys = load_encryption_keys()
    if keys:
        return keys

    logger.error("No encryption keys configured — secret storage is unavailable")
    raise SecretKeyProviderError(
        "No encryption keys configured. Set `SECRETS_ENCRYPTION_KEYS_REF` "
        "(preferred, Proton Pass reference) or `SECRETS_ENCRYPTION_KEYS` "
        "(comma-separated Fernet keys)."
    )


def clear_key_cache() -> None:
    """Key cache hook for compatibility with crypto cache lifecycle."""
    return None
