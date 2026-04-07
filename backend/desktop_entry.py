"""Packaged desktop backend entrypoint."""

import asyncio
import json
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from app.preflight import run_packaged_preflight

from run import _wait_for_port_free

BACKEND_HOST = os.environ.get("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "7000"))


def _run_preflight_cli() -> int:
    """Run packaged preflight checks and print a structured result."""
    result = run_packaged_preflight()
    print(json.dumps(result.to_dict()), flush=True)
    return 0 if result.ok else 1


def main() -> int:
    """Start the packaged FastAPI backend in production mode."""
    if "--preflight" in sys.argv:
        return _run_preflight_cli()

    import uvicorn
    from app.main import app

    preflight = run_packaged_preflight()
    if not preflight.ok:
        print(json.dumps(preflight.to_dict()), flush=True)
        return 1

    print(f"[serve] Backend on port {BACKEND_PORT} (production mode), DB: trading_agent")

    if not _wait_for_port_free(BACKEND_HOST, BACKEND_PORT, timeout_seconds=2.5):
        print(
            f"[serve] Port {BACKEND_PORT} is already in use. "
            "If another backend is running, stop it first."
        )
        return 1

    uvicorn.run(
        app,
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        loop="none",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
