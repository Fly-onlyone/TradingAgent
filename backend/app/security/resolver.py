"""Shared secret-resolution helper for settings endpoints.

Every API key in the app follows the same precedence: DB-encrypted value first,
then the environment-variable fallback. The pattern is small but repeats five
times in `app/api/v1/settings.py`, so it lives here as a single source of truth.
"""

from __future__ import annotations

from collections.abc import Callable


def resolve_secret(db_getter: Callable[[], str], env_value: str) -> str:
    """Return the DB-stored secret if present, else the env-var fallback."""
    return db_getter() or env_value
