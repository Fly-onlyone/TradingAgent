"""Tests for okx_atk.config_writer."""

from __future__ import annotations

import os
import tomllib
from pathlib import Path

import pytest

from app.agent.okx_atk.config_writer import atk_config_path, write_atk_config


def test_atk_config_path_ends_in_dot_okx_config_toml() -> None:
    """ATK reads `~/.okx/config.toml` on all OSes — don't drift to ~/.config/okx."""
    p = atk_config_path()
    assert p.name == "config.toml"
    assert ".okx" in str(p)


def test_write_atk_config_demo_and_live(tmp_path: Path) -> None:
    target = tmp_path / "config.toml"
    write_atk_config(
        path=target,
        default_profile="demo",
        live=("live-k", "live-s", "live-p"),
        demo=("demo-k", "demo-s", "demo-p"),
        site="global",
    )
    data = tomllib.loads(target.read_text(encoding="utf-8"))
    assert data["default_profile"] == "demo"
    assert data["profiles"]["live"]["api_key"] == "live-k"
    assert data["profiles"]["live"]["secret_key"] == "live-s"
    assert data["profiles"]["live"]["passphrase"] == "live-p"
    assert data["profiles"]["live"]["site"] == "global"
    # Live profile must NOT have demo=true.
    assert data["profiles"]["live"].get("demo") in (None, False)
    # Demo profile MUST have demo=true so ATK sets x-simulated-trading: 1.
    assert data["profiles"]["demo"]["api_key"] == "demo-k"
    assert data["profiles"]["demo"]["demo"] is True
    if os.name != "nt":
        assert oct(target.stat().st_mode & 0o777) == "0o600"


def test_write_atk_config_only_live(tmp_path: Path) -> None:
    target = tmp_path / "config.toml"
    write_atk_config(
        path=target,
        default_profile="live",
        live=("k", "s", "p"),
        demo=None,
        site="eea",
    )
    data = tomllib.loads(target.read_text(encoding="utf-8"))
    assert data["default_profile"] == "live"
    assert "live" in data["profiles"]
    assert "demo" not in data["profiles"]
    assert data["profiles"]["live"]["site"] == "eea"


def test_write_atk_config_skips_profile_with_missing_credentials(tmp_path: Path) -> None:
    """Partial credentials → silently skip that profile rather than write a broken one."""
    target = tmp_path / "config.toml"
    write_atk_config(
        path=target,
        default_profile="live",
        live=("k", None, "p"),  # missing secret
        demo=None,
    )
    data = tomllib.loads(target.read_text(encoding="utf-8"))
    assert "profiles" not in data or "live" not in data.get("profiles", {})
