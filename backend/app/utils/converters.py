"""Shared numeric conversion utilities for OKX API responses."""


def to_float(value: object, default: float = 0.0) -> float:
    """Convert numeric-like OKX values to float, tolerating empty strings."""
    if value is None:
        return default
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return default
        value = cleaned
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_optional_float(value: object) -> float | None:
    """Convert numeric-like OKX values to float or return None when blank."""
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        value = cleaned
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
