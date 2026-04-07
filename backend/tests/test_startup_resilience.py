"""Tests for startup resilience around background tasks and asyncio noise."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable

import pytest

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("SENTRY_DSN", "")

from app import main as app_main
from app.db import session as db_session
from app.news import scheduler as scheduler_module


class _DummyCrawler:
    async def close(self) -> None:
        return None


class _DummySummarizer:
    pass


class _DummyCredibility:
    pass


def _build_scheduler(monkeypatch: pytest.MonkeyPatch) -> scheduler_module.NewsScheduler:
    monkeypatch.setattr(scheduler_module, "NewsCrawler", _DummyCrawler)
    monkeypatch.setattr(scheduler_module, "NewsSummarizer", _DummySummarizer)
    monkeypatch.setattr(scheduler_module, "CredibilityScorer", _DummyCredibility)
    return scheduler_module.NewsScheduler()


@pytest.mark.asyncio
async def test_crawl_all_sources_only_queries_enabled_sources(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scheduler = _build_scheduler(monkeypatch)
    seen_query: dict[str, bool] | None = None

    class _FakeQuery:
        async def to_list(self) -> list[object]:
            return []

    def fake_find(query: dict[str, bool]) -> _FakeQuery:
        nonlocal seen_query
        seen_query = query
        return _FakeQuery()

    monkeypatch.setattr(scheduler_module.NewsSource, "find", fake_find)

    await scheduler._crawl_all_sources()

    assert seen_query == {"crawl_enabled": True}


@pytest.mark.asyncio
async def test_start_wraps_initial_crawl_exceptions_in_application_logging(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    scheduler = _build_scheduler(monkeypatch)
    created_tasks: list[asyncio.Task[None]] = []
    original_create_task = asyncio.create_task

    monkeypatch.setattr(scheduler.scheduler, "add_job", lambda *args, **kwargs: None)
    monkeypatch.setattr(scheduler.scheduler, "start", lambda: None)

    async def fail_crawl() -> None:
        raise RuntimeError("boom")

    def capture_create_task(coro: Awaitable[None]) -> asyncio.Task[None]:
        task = original_create_task(coro)
        created_tasks.append(task)
        return task

    monkeypatch.setattr(scheduler, "_crawl_all_sources", fail_crawl)
    monkeypatch.setattr(scheduler_module.asyncio, "create_task", capture_create_task)

    with caplog.at_level(logging.ERROR):
        await scheduler.start()
        await asyncio.gather(*created_tasks)

    assert created_tasks
    assert "Initial news crawl failed" in caplog.text
    assert "Task exception was never retrieved" not in caplog.text


def test_asyncio_handler_suppresses_known_windows_transport_reset(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    fallback_calls: list[dict[str, object]] = []

    monkeypatch.setattr(app_main.sys, "platform", "win32")

    def fallback_handler(context: dict[str, object]) -> None:
        fallback_calls.append(context)

    handler = app_main._build_asyncio_exception_handler(fallback_handler)
    error = ConnectionResetError("connection reset")
    error.winerror = 10054  # type: ignore[attr-defined]

    with caplog.at_level(logging.INFO):
        handler(
            None,
            {
                "message": "Exception in callback _ProactorBasePipeTransport._call_connection_lost(None)",
                "exception": error,
            },
        )

    assert not fallback_calls
    assert "Ignored benign Windows proactor transport reset" in caplog.text


def test_asyncio_handler_delegates_non_matching_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fallback_calls: list[dict[str, object]] = []

    monkeypatch.setattr(app_main.sys, "platform", "win32")

    def fallback_handler(context: dict[str, object]) -> None:
        fallback_calls.append(context)

    handler = app_main._build_asyncio_exception_handler(fallback_handler)
    context = {"message": "Some other asyncio error"}

    handler(None, context)

    assert fallback_calls == [context]


@pytest.mark.asyncio
async def test_validate_app_settings_secret_encryption_recovers_for_desktop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleared_fields: list[str] = []

    class _FakeSettingsDocument:
        def has_persisted_secret_values(self) -> bool:
            return True

        async def migrate_plaintext_secrets_if_needed(self) -> bool:
            return False

        def get_undecryptable_secret_fields(self) -> list[str]:
            return ["okx_api_key", "okx_secret_key"]

        async def clear_secret_fields(self, field_names: list[str]) -> list[str]:
            cleared_fields.extend(field_names)
            return field_names

    class _FakeAppSettings:
        @staticmethod
        async def get_instance() -> _FakeSettingsDocument:
            return _FakeSettingsDocument()

    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.setattr("app.db.models.app_settings.AppSettings", _FakeAppSettings)

    await db_session._validate_app_settings_secret_encryption()

    assert cleared_fields == ["okx_api_key", "okx_secret_key"]


@pytest.mark.asyncio
async def test_validate_app_settings_secret_encryption_stays_strict_for_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeSettingsDocument:
        def has_persisted_secret_values(self) -> bool:
            return True

        async def migrate_plaintext_secrets_if_needed(self) -> bool:
            return False

        def get_undecryptable_secret_fields(self) -> list[str]:
            return ["okx_api_key"]

    class _FakeAppSettings:
        @staticmethod
        async def get_instance() -> _FakeSettingsDocument:
            return _FakeSettingsDocument()

    monkeypatch.delenv("TAURI_APP", raising=False)
    monkeypatch.setattr("app.db.models.app_settings.AppSettings", _FakeAppSettings)

    with pytest.raises(RuntimeError, match="Stored application secrets could not be validated"):
        await db_session._validate_app_settings_secret_encryption()
