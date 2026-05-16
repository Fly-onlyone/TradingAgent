"""GridBot Beanie document — mirror target for ATK-created bots.

This is a mirror, not a write target — the agent creates bots via ATK's
`grid_create_order` / `dca_create_order` tools and the `order_mirror`
service polls OKX every 30s to upsert into this collection. UI reads from
here for `/orders` Bots tab.

Carries `agent_session_id` / `agent_session_message_id` / `tool_use_id` so
the mirror can O(1) update the originating chat-session tool-call bubble
when status flips (Chat-Session Checklist leg 4).
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import DESCENDING


class BotKind(str, Enum):
    SPOT_GRID = "grid"
    CONTRACT_GRID = "contract_grid"
    MOON_GRID = "moon_grid"
    DCA = "dca"


class BotStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"
    COMPLETED = "completed"


class GridBot(Document):
    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    algo_order_id: Indexed(str)  # type: ignore[valid-type]
    client_algo_order_id: Indexed(str) | None = None  # type: ignore[valid-type]

    # Chat-session linkage (mirror uses these for O(1) bubble update)
    agent_session_id: PydanticObjectId | None = None
    agent_session_message_id: PydanticObjectId | None = None
    tool_use_id: str | None = None

    symbol: Indexed(str)  # type: ignore[valid-type]
    kind: BotKind
    status: BotStatus = BotStatus.PENDING

    # Config snapshot
    max_price: float
    min_price: float
    grid_num: int | None = None
    quote_size: float | None = None
    base_size: float | None = None
    leverage: int | None = None
    direction: str | None = None
    tp_trigger_px: float | None = None
    sl_trigger_px: float | None = None

    # Runtime state
    last_pnl: float | None = None
    last_runtime_data: dict | None = None
    last_status_at: datetime | None = None

    # Provenance
    agent_reasoning: dict | None = None
    strategy_id: PydanticObjectId | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    stopped_at: datetime | None = None

    class Settings:
        name = "grid_bots"
        use_state_management = True
        indexes = [
            [("user_id", 1), ("created_at", DESCENDING)],
        ]
