"""Tests for automatic bug ingestion from log records."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.db.models.bug import Bug
from app.services.bug_automation_service import BugAutomationService


class FakeCollection:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}

    async def update_one(self, query: dict, update: dict, upsert: bool = False) -> None:
        fingerprint = query.get("fingerprint")
        if fingerprint is None:
            return

        doc = self.docs.get(fingerprint)
        if doc is None:
            if not upsert:
                return
            doc = {
                "fingerprint": fingerprint,
                "auto_created": query.get("auto_created", True),
            }
            for key, value in update.get("$setOnInsert", {}).items():
                doc[key] = value
            self.docs[fingerprint] = doc

        for query_key, query_value in query.items():
            if query_key == "fingerprint":
                continue
            if doc.get(query_key) != query_value:
                return

        for key, value in update.get("$set", {}).items():
            doc[key] = value

        for key, value in update.get("$inc", {}).items():
            doc[key] = int(doc.get(key, 0)) + int(value)


@pytest.fixture
def fake_collection(monkeypatch: pytest.MonkeyPatch) -> FakeCollection:
    collection = FakeCollection()
    monkeypatch.setattr(Bug, "get_pymongo_collection", staticmethod(lambda: collection))
    return collection


def _base_record(level: str = "ERROR", message: str = "boom") -> dict:
    return {
        "timestamp": datetime.now(UTC),
        "level": level,
        "logger_name": "app.api.v1.orders",
        "message": message,
        "module": "orders",
        "function": "create_order",
        "line": 42,
        "request_id": "req-123",
        "user_id": "user-123",
        "traceback": (
            "Traceback (most recent call last):\n"
            '  File "backend/app/api/v1/orders.py", line 42, in create_order\n'
            "RuntimeError: boom"
        ),
    }


@pytest.mark.asyncio
async def test_ingest_creates_new_bug(fake_collection: FakeCollection) -> None:
    service = BugAutomationService()

    await service.ingest_log_records([_base_record()])

    assert len(fake_collection.docs) == 1
    created = next(iter(fake_collection.docs.values()))
    assert created["auto_created"] is True
    assert created["occurrence_count"] == 1
    assert created["status"] == "open"
    assert created["severity"] == "high"


@pytest.mark.asyncio
async def test_ingest_deduplicates_and_increments(
    fake_collection: FakeCollection,
) -> None:
    service = BugAutomationService()
    record = _base_record(message="order creation failed")

    await service.ingest_log_records([record])
    await service.ingest_log_records([record])

    assert len(fake_collection.docs) == 1
    created = next(iter(fake_collection.docs.values()))
    assert created["occurrence_count"] == 2


@pytest.mark.asyncio
async def test_resolved_bug_is_reopened_on_recurrence(
    fake_collection: FakeCollection,
) -> None:
    service = BugAutomationService()
    record = _base_record()

    await service.ingest_log_records([record])
    created = next(iter(fake_collection.docs.values()))
    created["status"] = "resolved"
    created["resolved_at"] = datetime.now(UTC)

    await service.ingest_log_records([record])

    assert created["status"] == "open"
    assert created["resolved_at"] is None
    assert created["occurrence_count"] == 2


@pytest.mark.asyncio
async def test_critical_maps_to_critical_severity(
    fake_collection: FakeCollection,
) -> None:
    service = BugAutomationService()

    await service.ingest_log_records([_base_record(level="CRITICAL")])

    created = next(iter(fake_collection.docs.values()))
    assert created["severity"] == "critical"


@pytest.mark.asyncio
async def test_fingerprint_normalizes_dynamic_values(
    fake_collection: FakeCollection,
) -> None:
    service = BugAutomationService()
    first = _base_record(
        message="Order 1234567890 failed with id 507f1f77bcf86cd799439011"
    )
    second = _base_record(
        message="Order 9988776655 failed with id 507f1f77bcf86cd799439012"
    )

    await service.ingest_log_records([first])
    await service.ingest_log_records([second])

    assert len(fake_collection.docs) == 1


@pytest.mark.asyncio
async def test_fingerprint_normalizes_short_numeric_noise(
    fake_collection: FakeCollection,
) -> None:
    service = BugAutomationService()
    first = _base_record(message="GET /api/v1/agent/sessions/grouped 500 5ms")
    second = _base_record(message="GET /api/v1/agent/sessions/grouped 500 23ms")

    await service.ingest_log_records([first])
    await service.ingest_log_records([second])

    assert len(fake_collection.docs) == 1


def test_extract_top_app_frame_prefers_deepest_frame() -> None:
    service = BugAutomationService()
    traceback_text = "\n".join(
        [
            "Traceback (most recent call last):",
            '  File "backend/app/middleware/request_logging.py", line 42, in dispatch',
            '  File "backend/app/api/v1/agent_sessions.py", line 159, in get_date_label',
            "TypeError: can't subtract offset-naive and offset-aware datetimes",
        ]
    )

    frame = service._extract_top_app_frame(traceback_text)
    assert "backend/app/api/v1/agent_sessions.py" in frame
