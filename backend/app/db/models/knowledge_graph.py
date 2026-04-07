"""Lightweight knowledge graph for tracking relationships between trading entities."""

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class RelationType(str, Enum):
    """Types of relationships between knowledge entities."""

    APPLIES_TO = "applies_to"  # Strategy → Asset
    USED_IN = "used_in"  # Strategy → Trade Lesson
    CORRELATED_WITH = "correlated_with"  # Asset → Asset
    DETECTED_IN = "detected_in"  # Pattern → Asset
    MENTIONS = "mentions"  # News → Asset
    CONTRADICTS = "contradicts"  # Strategy → Strategy
    SUPPORTS = "supports"  # Pattern → Strategy
    LEARNED_FROM = "learned_from"  # Lesson → Trade (order)


class KnowledgeEdge(Document):
    """An edge in the knowledge graph connecting two entities."""

    source_id: PydanticObjectId
    source_collection: str  # e.g. "strategy_knowledge", "trade_lessons"
    target_id: PydanticObjectId
    target_collection: str
    relation_type: RelationType
    weight: float = 1.0  # Strength of the relationship
    metadata: dict = Field(default_factory=dict)  # Extra context
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "knowledge_edges"
        use_state_management = True
        indexes = [
            IndexModel(
                [("source_id", ASCENDING), ("relation_type", ASCENDING)],
                name="edges_source_relation",
            ),
            IndexModel(
                [("target_id", ASCENDING), ("relation_type", ASCENDING)],
                name="edges_target_relation",
            ),
            IndexModel(
                [("source_collection", ASCENDING), ("target_collection", ASCENDING)],
                name="edges_collections",
            ),
            IndexModel(
                [("created_at", DESCENDING)],
                name="edges_created_desc",
            ),
        ]
