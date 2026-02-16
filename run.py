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
import subprocess
import sys

# ── ProactorEventLoop on Windows ──────────────────────────────────────
# MUST be set at module level, before any asyncio.run() / event loop creation.
# This ensures every process that executes this file uses ProactorEventLoop,
# which supports asyncio.create_subprocess_exec() required by Claude Agent SDK.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


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


def _run_server() -> None:
    """Start uvicorn directly — no reload, no multiprocessing subprocess."""
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=7000,
        loop="none",  # Don't let uvicorn override our ProactorEventLoopPolicy
    )


if __name__ == "__main__":
    if "--serve" in sys.argv:
        # ── Direct mode: called by the file watcher or by user ─────────
        # ProactorEventLoopPolicy is already set above (module-level).
        # uvicorn runs without reload → no multiprocessing → no policy override.
        _run_server()
    else:
        # ── Dev mode: start frontend + backend with auto-reload ────────
        frontend_dir = os.path.join(PROJECT_DIR, "frontend")
        frontend_cmd = (
            ["npm.cmd", "run", "dev"]
            if sys.platform == "win32"
            else ["npm", "run", "dev"]
        )
        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir)
        backend_proc: subprocess.Popen | None = None

        def start_backend() -> subprocess.Popen:
            """Spawn a fresh backend subprocess with ProactorEventLoop."""
            return subprocess.Popen(
                [sys.executable, os.path.join(PROJECT_DIR, "run.py"), "--serve"],
                cwd=PROJECT_DIR,
            )

        try:
            backend_proc = start_backend()

            # Watch backend/ for Python file changes and restart on change
            from watchfiles import watch

            print("[dev] Watching backend/ for changes...")
            for changes in watch(
                os.path.join(PROJECT_DIR, "backend"),
                watch_filter=lambda _, path: path.endswith(".py"),
            ):
                changed_files = [os.path.basename(p) for _, p in changes]
                print(f"[dev] Reloading — changed: {', '.join(changed_files)}")
                _terminate_process(backend_proc)
                backend_proc = start_backend()

        except KeyboardInterrupt:
            pass
        finally:
            _terminate_process(backend_proc)
            _terminate_process(frontend_proc)
