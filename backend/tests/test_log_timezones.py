"""Tests for log timestamps rendered in machine-local time."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret")

from app.api.v1 import logs as logs_api
from app.logging_config import ColoredFormatter, JSONFormatter
from app.utils.timezones import to_local_datetime

ICT = timezone(timedelta(hours=7), name="ICT")


def test_to_local_datetime_treats_naive_mongo_values_as_utc() -> None:
    naive_utc = datetime(2026, 4, 8, 10, 0, 0)

    localized = to_local_datetime(naive_utc, target_tz=ICT)

    assert localized == datetime(2026, 4, 8, 17, 0, 0, tzinfo=ICT)


def test_log_response_serializes_logs_in_local_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        logs_api,
        "to_local_datetime",
        lambda value: to_local_datetime(value, target_tz=ICT),
    )
    log = SimpleNamespace(
        id="log-1",
        timestamp=datetime(2026, 4, 8, 10, 0, 0),
        level="WARNING",
        logger_name="app.test",
        message="Clock drift",
        module="test_module",
        function="test_func",
        line=42,
        request_id=None,
        user_id=None,
        extra=None,
        traceback=None,
    )

    response = logs_api._log_to_response(log)

    assert response.timestamp == datetime(2026, 4, 8, 17, 0, 0, tzinfo=ICT)


def test_json_formatter_uses_local_timestamp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.logging_config.timestamp_to_local_datetime",
        lambda _: datetime(2026, 4, 8, 17, 0, 0, tzinfo=ICT),
    )
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=24,
        msg="Synchronized",
        args=(),
        exc_info=None,
    )

    payload = json.loads(formatter.format(record))

    assert payload["timestamp"] == "2026-04-08T17:00:00+07:00"


def test_colored_formatter_uses_local_clock_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.logging_config.timestamp_to_local_datetime",
        lambda _: datetime(2026, 4, 8, 17, 0, 0, tzinfo=ICT),
    )
    formatter = ColoredFormatter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=24,
        msg="Synchronized",
        args=(),
        exc_info=None,
    )

    rendered = formatter.format(record)

    assert rendered.startswith("17:00:00 ")
