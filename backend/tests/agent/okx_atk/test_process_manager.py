"""Tests for okx_atk.process_manager."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agent.okx_atk import process_manager as pm
from app.agent.okx_atk.process_manager import (
    AtkProcessManager,
    _resolve_command_uncached,
    _scrub_stderr,
)


@pytest.fixture(autouse=True)
def _reset_singleton() -> None:
    pm._reset_for_tests()
    yield
    pm._reset_for_tests()


def test_resolve_command_production_requires_sidecar(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TAURI_RESOURCE_DIR", str(tmp_path))
    # No sidecar in tmp_path/binaries — must raise, NOT fall through.
    with pytest.raises(RuntimeError, match="ATK sidecar missing"):
        _resolve_command_uncached()


def test_resolve_command_dev_path_first(monkeypatch) -> None:
    monkeypatch.delenv("TAURI_RESOURCE_DIR", raising=False)
    monkeypatch.setattr("shutil.which", lambda _name: "/usr/local/bin/okx-trade-mcp")
    cmd = _resolve_command_uncached()
    assert cmd == ["/usr/local/bin/okx-trade-mcp"]


def test_resolve_command_dev_fallback_to_npx_pinned(monkeypatch) -> None:
    monkeypatch.delenv("TAURI_RESOURCE_DIR", raising=False)
    monkeypatch.setattr("shutil.which", lambda _name: None)
    cmd = _resolve_command_uncached()
    assert cmd[0] == "npx"
    assert cmd[1] == "-y"
    assert cmd[2].startswith("@okx_ai/okx-trade-mcp@")  # version pinned


def test_scrub_stderr_redacts_api_key_in_kv_form() -> None:
    line = 'api_key="a1b2c3d4e5f6g7" loading config'
    out = _scrub_stderr(line)
    assert "a1b2c3d4e5f6g7" not in out
    assert "redacted:14" in out


def test_scrub_stderr_redacts_camelcase_secretkey() -> None:
    line = "secretKey: aBcDeFgHiJkLmNoP"
    out = _scrub_stderr(line)
    assert "aBcDeFgHiJkLmNoP" not in out
    assert "secretKey=<redacted" in out.lower() or "secretKey=<redacted" in out


def test_scrub_stderr_redacts_jwt() -> None:
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    line = f"auth bearer {jwt}"
    out = _scrub_stderr(line)
    assert jwt not in out
    assert "<jwt:redacted>" in out


def test_scrub_stderr_passes_clean_lines() -> None:
    line = "Starting ATK server on stdio transport, modules: market,spot"
    assert _scrub_stderr(line) == line


@pytest.mark.asyncio
async def test_concurrent_start_only_spawns_one_child(monkeypatch) -> None:
    """Race-test: two simultaneous start() calls must serialize via the lock."""
    monkeypatch.setattr("shutil.which", lambda _name: "/bin/okx-trade-mcp")

    spawn_count = 0

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        nonlocal spawn_count
        spawn_count += 1
        proc = MagicMock()
        proc.returncode = None
        proc.stderr = MagicMock()
        proc.stderr.readline = AsyncMock(return_value=b"")
        return proc

    monkeypatch.setattr("asyncio.create_subprocess_exec", fake_create_subprocess_exec)

    mgr = AtkProcessManager(modules="market")
    await asyncio.gather(mgr.start(profile="demo"), mgr.start(profile="demo"))
    assert spawn_count == 1
    assert mgr.is_running


@pytest.mark.asyncio
async def test_is_accepting_starts_true() -> None:
    mgr = AtkProcessManager()
    assert mgr.is_accepting() is True
    mgr.set_accepting(False)
    assert mgr.is_accepting() is False


def test_stdio_argv_includes_profile_and_modules(monkeypatch) -> None:
    monkeypatch.setattr("shutil.which", lambda _name: "/bin/okx-trade-mcp")
    mgr = AtkProcessManager(modules="market,spot,account")
    argv = mgr.stdio_argv(profile="live")
    assert "--profile" in argv and "live" in argv
    assert "--modules" in argv
    assert "market,spot,account" in argv


def test_stdio_argv_read_only_flag(monkeypatch) -> None:
    monkeypatch.setattr("shutil.which", lambda _name: "/bin/okx-trade-mcp")
    mgr = AtkProcessManager(modules="market")
    argv = mgr.stdio_argv(profile="demo", read_only=True)
    assert "--read-only" in argv
