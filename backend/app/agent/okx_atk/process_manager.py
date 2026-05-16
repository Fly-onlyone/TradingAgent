"""Manages the okx-trade-mcp subprocess lifecycle.

claude-agent-sdk spawns its OWN ATK child from `mcp_servers["okx"]`. This
module exists because the OpenAI bridge needs a separate, long-lived stdio
session — and because sandbox-toggle needs a single place to coordinate a
profile switch (drain inflight → restart child → reconnect bridge).

Resolution priority for the binary:
  1. Production (TAURI_RESOURCE_DIR set): TAURI_RESOURCE_DIR/binaries/<BIN_NAME>.
     Refuses to fall through — supply-chain attack surface.
  2. Development: okx-trade-mcp on PATH.
  3. Development fallback: `npx -y @okx_ai/okx-trade-mcp@<pinned>` — pinned
     version from atk-version.txt.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import platform
import re
import shutil
from pathlib import Path
from typing import Final

from app.agent.okx_atk.tool_curation import DEFAULT_MODULES

logger = logging.getLogger(__name__)
BIN_NAME: Final = "okx-trade-mcp.cmd" if platform.system() == "Windows" else "okx-trade-mcp"


def _is_production() -> bool:
    """Tauri sets TAURI_RESOURCE_DIR at app start — use as production marker."""
    return bool(os.environ.get("TAURI_RESOURCE_DIR"))


def _read_pinned_version() -> str:
    """Read frontend/src-tauri/scripts/atk-version.txt; default to a known-good pin."""
    try:
        candidate = (
            Path(__file__).resolve().parents[4]
            / "frontend"
            / "src-tauri"
            / "scripts"
            / "atk-version.txt"
        )
        return candidate.read_text(encoding="utf-8").strip()
    except Exception:
        return "1.3.3"  # known-good fallback — bump only with security review


def _tauri_sidecar_target() -> tuple[str, str]:
    """Return (subdir_name, launcher_filename) for the current platform."""
    system = platform.system()
    machine = platform.machine().lower()
    if system == "Windows":
        return "okx-trade-mcp-win-x64", "launch.cmd"
    if system == "Darwin":
        arch = "arm64" if machine in {"arm64", "aarch64"} else "x64"
        return f"okx-trade-mcp-darwin-{arch}", "launch.sh"
    # Linux + everything else POSIX-y
    return "okx-trade-mcp-linux-x64", "launch.sh"


def _resolve_command_uncached() -> list[str]:
    tauri_dir = os.environ.get("TAURI_RESOURCE_DIR")
    if tauri_dir:
        subdir, launcher = _tauri_sidecar_target()
        candidate = os.path.join(tauri_dir, "binaries", subdir, launcher)
        if os.path.exists(candidate):
            return [candidate]
        # Production MUST NOT fall through to PATH or npx — supply-chain risk.
        raise RuntimeError(
            f"ATK sidecar missing at {candidate} (production build). "
            "Reinstall the app — do not invoke npx as a workaround."
        )

    found = shutil.which(BIN_NAME)
    if found:
        return [found]

    pinned = _read_pinned_version()
    return ["npx", "-y", f"@okx_ai/okx-trade-mcp@{pinned}"]


@functools.lru_cache(maxsize=1)
def _resolve_command_cached() -> tuple[str, ...]:
    """Cached form — tuple so it's hashable. resolve_command() converts to list."""
    return tuple(_resolve_command_uncached())


def resolve_command() -> list[str]:
    return list(_resolve_command_cached())


def invalidate_command_cache() -> None:
    """Called from atk_lifecycle.on_sandbox_toggle when the binary path or
    pinned version might have changed."""
    _resolve_command_cached.cache_clear()


# --- Stderr credential scrub ---

_CRED_RE = re.compile(
    r"(api[_-]?key|secret[_-]?key|passphrase|sign(?:ature)?|token|bearer)"
    r'\W{1,3}["\']?([A-Za-z0-9+/=_-]{8,})',
    re.IGNORECASE,
)
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")


def _scrub_stderr(line: str) -> str:
    """Belt-and-braces credential scrub for ATK stderr.

    Misses are possible — ATK is third-party code, we don't own its log
    output. Defense in depth: route raw stderr to ~/.okx/logs/ (chmod 600
    by ATK itself) and emit only severity-tagged summaries here.

    JWT runs first so a `bearer eyJ...` line doesn't get partially eaten by the
    bearer-label match in _CRED_RE.
    """
    line = _JWT_RE.sub("<jwt:redacted>", line)
    line = _CRED_RE.sub(lambda m: f"{m.group(1)}=<redacted:{len(m.group(2))}>", line)
    return line


class AtkProcessManager:
    def __init__(self, modules: str = DEFAULT_MODULES) -> None:
        self.modules = modules
        self._proc: asyncio.subprocess.Process | None = None
        self._profile: str = "demo"
        self._lock = asyncio.Lock()
        self._accepting = True
        self._stderr_task: asyncio.Task[None] | None = None

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    @property
    def profile(self) -> str:
        return self._profile

    def is_accepting(self) -> bool:
        """False during a sandbox-toggle drain. Hook returns 'retry in 5s' deny."""
        return self._accepting

    def set_accepting(self, value: bool) -> None:
        self._accepting = value

    def stdio_argv(self, *, profile: str | None = None, read_only: bool = False) -> list[str]:
        """Build argv for spawning ATK as a stdio MCP server.

        Used by:
        - this manager's own long-lived child (for the OpenAI bridge),
        - ClaudeAgentOptions.mcp_servers (claude-agent-sdk spawns its own child).
        """
        cmd = resolve_command()
        args = [
            *cmd,
            "--profile",
            profile or self._profile,
            "--modules",
            self.modules,
        ]
        if read_only:
            args.append("--read-only")
        return args

    async def start(self, *, profile: str = "demo") -> None:
        async with self._lock:
            if self.is_running and profile == self._profile:
                return
            if self.is_running:
                await self._stop_locked()
            await self._start_locked(profile)

    async def _start_locked(self, profile: str) -> None:
        argv = self.stdio_argv(profile=profile)
        # SECURITY: never log argv verbatim. Only basename + profile + module count.
        logger.info(
            "Starting ATK child: bin=%s profile=%s modules=%d",
            os.path.basename(argv[0]),
            profile,
            len(self.modules.split(",")),
        )
        self._proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._profile = profile
        # Drain stderr concurrently to avoid pipe-fill deadlock (~64KB).
        self._stderr_task = asyncio.create_task(self._drain_stderr())

    async def _drain_stderr(self) -> None:
        assert self._proc and self._proc.stderr
        try:
            while True:
                line = await self._proc.stderr.readline()
                if not line:
                    return
                text = _scrub_stderr(line.decode("utf-8", "ignore").rstrip())
                logger.info("[atk] %s", text)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("ATK stderr drain failed")

    async def stop(self) -> None:
        async with self._lock:
            await self._stop_locked()

    async def _stop_locked(self) -> None:
        if not self._proc or self._proc.returncode is not None:
            self._proc = None
            return
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            self._stderr_task = None
        self._proc.terminate()
        try:
            await asyncio.wait_for(self._proc.wait(), timeout=5)
        except TimeoutError:
            self._proc.kill()
            await self._proc.wait()
        self._proc = None

    async def restart(self, *, profile: str | None = None) -> None:
        async with self._lock:
            await self._stop_locked()
            await self._start_locked(profile or self._profile)


_instance: AtkProcessManager | None = None


def get_manager() -> AtkProcessManager:
    global _instance
    if _instance is None:
        _instance = AtkProcessManager()
    return _instance


def _reset_for_tests() -> None:
    """Module-level test helper. Singletons + tests don't mix; use this in fixtures."""
    global _instance
    _instance = None
    _resolve_command_cached.cache_clear()
