"""Timezone helpers for log display and API serialization."""

from datetime import UTC, datetime, tzinfo


def to_local_datetime(value: datetime, *, target_tz: tzinfo | None = None) -> datetime:
    """Convert a datetime to local time, treating naive values as UTC.

    MongoDB commonly returns naive UTC datetimes unless the client is configured
    as timezone-aware. The log viewer expects machine-local timestamps, so
    normalize those values before formatting or serializing them.
    """

    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=UTC)

    return value.astimezone(target_tz)


def timestamp_to_local_datetime(
    timestamp: float,
    *,
    target_tz: tzinfo | None = None,
) -> datetime:
    """Convert a Unix timestamp to machine-local time."""

    return datetime.fromtimestamp(timestamp, tz=UTC).astimezone(target_tz)


def get_local_now(*, target_tz: tzinfo | None = None) -> datetime:
    """Get the current machine-local time as an aware datetime."""

    return datetime.now(UTC).astimezone(target_tz)
