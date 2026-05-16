"""Writes ~/.okx/config.toml so okx-trade-mcp can authenticate.

Reads encrypted keys from AppSettings (Fernet) and decrypts only for this
file write. File is chmod 0600 on POSIX; on Windows we explicitly harden the
DACL via `icacls` so the file isn't readable by other accounts on a
domain-joined / multi-user machine.

Never log key values — trading-safety-reviewer rule.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def atk_config_path() -> Path:
    """Cross-platform `~/.okx/config.toml` — ATK reads this exact path on all OSes."""
    return Path.home() / ".okx" / "config.toml"


def write_atk_config(
    *,
    path: Path,
    default_profile: str,
    live: tuple[str | None, str | None, str | None] | None = None,
    demo: tuple[str | None, str | None, str | None] | None = None,
    site: str = "global",
) -> None:
    """Write the ATK profiles TOML.

    The `demo` profile is marked with `demo = true` so ATK adds the
    `x-simulated-trading: 1` header on OKX requests.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = [f'default_profile = "{default_profile}"', ""]
    if live and all(live):
        lines += [
            "[profiles.live]",
            f'api_key = "{live[0]}"',
            f'secret_key = "{live[1]}"',
            f'passphrase = "{live[2]}"',
            f'site = "{site}"',
            "",
        ]
    if demo and all(demo):
        lines += [
            "[profiles.demo]",
            f'api_key = "{demo[0]}"',
            f'secret_key = "{demo[1]}"',
            f'passphrase = "{demo[2]}"',
            "demo = true",
            f'site = "{site}"',
            "",
        ]
    path.write_text("\n".join(lines), encoding="utf-8")
    if os.name != "nt":
        path.chmod(0o600)
    else:
        _harden_windows_acl(path)


def _harden_windows_acl(path: Path) -> None:
    """Restrict DACL on Windows to current user only.

    Without this, ~/.okx/config.toml inherits %USERPROFILE% ACLs. On
    domain-joined or multi-user machines that file may be readable by
    Administrators or other accounts. We use `icacls` (ships with Windows)
    so we don't add a pywin32 dependency.
    """
    user = os.environ.get("USERNAME") or os.environ.get("USER") or ""
    if not user:
        logger.warning("Cannot harden ACL for %s — USERNAME env missing", path)
        return
    try:
        subprocess.run(
            ["icacls", str(path), "/inheritance:r"],
            check=True,
            capture_output=True,
            timeout=5,
        )
        subprocess.run(
            ["icacls", str(path), "/grant:r", f"{user}:F"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except subprocess.CalledProcessError as exc:
        logger.warning(
            "icacls hardening failed for %s: %s",
            path,
            exc.stderr.decode("utf-8", "ignore"),
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("icacls unavailable — %s may be readable by other Windows users", path)


async def sync_from_app_settings() -> Path:
    """Decrypt AppSettings → write ~/.okx/config.toml → return path.

    OKX demo trading uses a flag (`demo = true` in the profile) rather than
    separate keys, so the same credentials populate both profiles. Real demo
    keys are a follow-up if we ever support truly separate live + demo accounts.
    """
    from app.db.models.app_settings import AppSettings

    settings = await AppSettings.get_instance()
    keys = (
        settings.get_okx_api_key(),
        settings.get_okx_secret_key(),
        settings.get_okx_passphrase(),
    )
    path = atk_config_path()
    write_atk_config(
        path=path,
        default_profile="demo" if settings.okx_sandbox else "live",
        live=keys if all(keys) else None,
        demo=keys if all(keys) else None,
        site=getattr(settings, "okx_site", "global"),
    )
    return path
