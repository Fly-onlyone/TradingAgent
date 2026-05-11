"""Helpers for lightweight process memory telemetry."""

from __future__ import annotations

import logging
from typing import Any


def get_process_rss_mb() -> float | None:
    """Return the current process RSS in megabytes, if available."""
    try:
        import psutil
    except Exception:
        return None

    try:
        process = psutil.Process()
        return round(process.memory_info().rss / (1024 * 1024), 1)
    except Exception:
        return None


def log_memory_checkpoint(
    logger: logging.Logger,
    *,
    phase: str,
    session_id: str | None = None,
    task_id: str | None = None,
    symbol: str | None = None,
    session_kind: str | None = None,
    baseline_mb: float | None = None,
    extra: dict[str, Any] | None = None,
) -> float | None:
    """Log a structured memory checkpoint and return the sampled RSS."""
    rss_mb = get_process_rss_mb()
    payload: dict[str, Any] = {
        "phase": phase,
        "rss_mb": rss_mb,
        "session_id": session_id,
        "task_id": task_id,
        "symbol": symbol,
        "session_kind": session_kind,
    }
    if baseline_mb is not None and rss_mb is not None:
        payload["rss_delta_mb"] = round(rss_mb - baseline_mb, 1)
    if extra:
        payload.update(extra)

    logger.info("Memory checkpoint: %s", phase, extra=payload)
    return rss_mb
