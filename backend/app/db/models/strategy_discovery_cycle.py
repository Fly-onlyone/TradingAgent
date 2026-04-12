"""Strategy discovery cycle document — one per auto-discovery run."""

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import DESCENDING, IndexModel


class DiscoveryCycleStatus(str, Enum):
    RUNNING = "running"
    OK = "ok"
    FAILED = "failed"


class StrategyDiscoveryCycle(Document):
    """One auto-discovery cycle, linking an Explorer session to its Extractor sessions."""

    # Agent chat sessions produced by the cycle (clickable from the UI).
    explorer_session_id: PydanticObjectId | None = None
    extractor_session_ids: list[PydanticObjectId] = Field(default_factory=list)

    # Summary counters — updated in-flight so /admin/strategy-discovery/cycles
    # can render progress without re-joining collections.
    candidates_found: int = 0
    strategies_saved: int = 0
    strategies_skipped_low_confidence: int = 0
    strategies_failed: int = 0

    status: DiscoveryCycleStatus = DiscoveryCycleStatus.RUNNING
    error: str | None = None

    # Triggered manually (admin endpoint) vs. by the APScheduler job.
    manual: bool = False
    triggered_by_user_id: PydanticObjectId | None = None

    started_at: Indexed(datetime) = Field(default_factory=lambda: datetime.now(UTC))  # type: ignore[valid-type]
    ended_at: datetime | None = None

    class Settings:
        name = "strategy_discovery_cycles"
        use_state_management = True
        indexes = [
            IndexModel(
                [("started_at", DESCENDING)],
                name="strategy_discovery_cycles_started_desc",
            ),
        ]
