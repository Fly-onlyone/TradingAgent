"""Detect running game processes to defer CPU-heavy embedding tasks."""

import asyncio
import logging

import psutil

logger = logging.getLogger(__name__)


async def is_game_running(process_names: list[str]) -> bool:
    """Check if any configured game process is currently running.

    Args:
        process_names: List of executable names to check (e.g. ["cs2.exe", "valorant.exe"])
    """
    if not process_names:
        return False

    lower_names = {name.lower() for name in process_names}

    def _check() -> bool:
        for proc in psutil.process_iter(["name"]):
            try:
                name = proc.info["name"]
                if name and name.lower() in lower_names:
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return False

    return await asyncio.to_thread(_check)


async def wait_for_game_exit(
    process_names: list[str],
    check_interval_minutes: int = 3,
) -> None:
    """Block until no configured game process is running.

    Polls every `check_interval_minutes` and returns once all games have exited.
    Other async tasks continue running while this coroutine awaits.
    """
    interval_seconds = max(check_interval_minutes, 1) * 60

    while await is_game_running(process_names):
        logger.info(
            "Game detected — deferring embedding task (next check in %d min)",
            check_interval_minutes,
        )
        await asyncio.sleep(interval_seconds)

    logger.info("No game detected — proceeding with embedding task")
