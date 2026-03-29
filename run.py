"""Fullstack dev entry point — starts backend and frontend together.

On Windows, uvicorn defaults to SelectorEventLoop which doesn't support
subprocess creation needed by the Claude Agent SDK. We CANNOT use uvicorn's
built-in --reload because it spawns child processes via multiprocessing.spawn
where asyncio.run() creates a SelectorEventLoop BEFORE our policy takes effect.

Solution: run uvicorn WITHOUT reload, and use watchfiles externally to restart
the entire process on code changes. Each restart is a fresh `python run.py
--serve` where the module-level ProactorEventLoopPolicy runs first.
"""

import asyncio
import os
import socket
import subprocess
import sys
import time

# ── ProactorEventLoop on Windows ──────────────────────────────────────
# MUST be set at module level, before any asyncio.run() / event loop creation.
# This ensures every process that executes this file uses ProactorEventLoop,
# which supports asyncio.create_subprocess_exec() required by Claude Agent SDK.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_HOST = os.environ.get("BACKEND_HOST", "127.0.0.1")

# --serve is used by Tauri exe (production) → default 7000
# Dev mode (no --serve) → default 7001 so both can run simultaneously
_DEFAULT_PORT = 7000 if "--serve" in sys.argv else 7001
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", str(_DEFAULT_PORT)))


def _is_port_free(host: str, port: int) -> bool:
    """Return True when nothing is listening on host:port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) != 0


def _wait_for_port_free(
    host: str, port: int, timeout_seconds: float = 5.0, poll_seconds: float = 0.1
) -> bool:
    """Wait until host:port is free, or timeout."""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if _is_port_free(host, port):
            return True
        time.sleep(poll_seconds)
    return _is_port_free(host, port)


def _terminate_process(proc: subprocess.Popen | None) -> None:
    """Terminate a process and all children (important on Windows)."""
    if proc is None or proc.poll() is not None:
        return

    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def _run_server() -> int:
    """Start uvicorn directly — no reload, no multiprocessing subprocess."""
    import uvicorn

    _mode = "production" if os.environ.get("TAURI_APP") else "dev"
    _db = os.environ.get(
        "MONGODB_DB_NAME", "trading_agent" if _mode == "production" else "trading_agent_dev"
    )
    print(f"[serve] Backend on port {BACKEND_PORT} ({_mode} mode), DB: {_db}")

    if not _wait_for_port_free(BACKEND_HOST, BACKEND_PORT, timeout_seconds=2.5):
        print(
            f"[serve] Port {BACKEND_PORT} is already in use. "
            "If another backend is running, stop it first."
        )
        return 1

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        loop="none",  # Don't let uvicorn override our ProactorEventLoopPolicy
    )
    return 0


def _run_with_watch() -> int:
    """Serve with auto-reload on Python file changes (for Tauri dev)."""
    from watchfiles import watch

    backend_proc: subprocess.Popen | None = None

    def _start() -> subprocess.Popen:
        if not _wait_for_port_free(BACKEND_HOST, BACKEND_PORT, timeout_seconds=8.0):
            raise RuntimeError(f"[watch] Port {BACKEND_PORT} is still in use")
        return subprocess.Popen(
            [sys.executable, os.path.join(PROJECT_DIR, "run.py"), "--serve"],
            cwd=PROJECT_DIR,
        )

    try:
        backend_proc = _start()
        print("[watch] Backend started. Watching backend/ for changes...")

        for changes in watch(
            os.path.join(PROJECT_DIR, "backend"),
            watch_filter=lambda _, path: path.endswith(".py"),
            force_polling=True,
            poll_delay_ms=500,
        ):
            changed_files = [os.path.basename(p) for _, p in changes]
            print(f"[watch] Reloading — changed: {', '.join(changed_files)}")
            _terminate_process(backend_proc)
            backend_proc = _start()

    except KeyboardInterrupt:
        pass
    finally:
        _terminate_process(backend_proc)
    return 0


if __name__ == "__main__":
    if "--watch" in sys.argv:
        # ── Watch mode: serve + auto-reload (for Tauri dev) ────────────
        sys.exit(_run_with_watch())
    elif "--serve" in sys.argv:
        # ── Direct mode: called by the file watcher or by user ─────────
        # ProactorEventLoopPolicy is already set above (module-level).
        # uvicorn runs without reload → no multiprocessing → no policy override.
        sys.exit(_run_server())
    else:
        # ── Dev mode: start frontend + backend with auto-reload ────────
        frontend_dir = os.path.join(PROJECT_DIR, "frontend")
        frontend_cmd = ["bun", "run", "dev"]
        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir)
        backend_proc: subprocess.Popen | None = None

        def start_backend() -> subprocess.Popen:
            """Spawn a fresh backend subprocess with ProactorEventLoop."""
            if not _wait_for_port_free(BACKEND_HOST, BACKEND_PORT, timeout_seconds=8.0):
                raise RuntimeError(
                    f"[dev] Port {BACKEND_PORT} is still in use. "
                    "Stop the conflicting process and rerun `python run.py`."
                )
            return subprocess.Popen(
                [sys.executable, os.path.join(PROJECT_DIR, "run.py"), "--serve"],
                cwd=PROJECT_DIR,
            )

        try:
            backend_proc = start_backend()

            # Watch backend/ for Python file changes and restart on change
            from watchfiles import watch

            print("[dev] Watching backend/ for changes (polling mode)...")
            for changes in watch(
                os.path.join(PROJECT_DIR, "backend"),
                watch_filter=lambda _, path: path.endswith(".py"),
                force_polling=True,
                poll_delay_ms=500,
            ):
                changed_files = [os.path.basename(p) for _, p in changes]
                print(f"[dev] Reloading — changed: {', '.join(changed_files)}")
                _terminate_process(backend_proc)
                backend_proc = start_backend()

        except RuntimeError as exc:
            print(exc)
            _terminate_process(backend_proc)
            _terminate_process(frontend_proc)
            sys.exit(1)
        except KeyboardInterrupt:
            pass
        finally:
            _terminate_process(backend_proc)
            _terminate_process(frontend_proc)
