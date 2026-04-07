"""Knowledge graph builder and traversal for trading entity relationships.

Builds edges incrementally as documents are created, enabling multi-hop
reasoning queries like "strategies that work for BTC in bearish markets
with profitable lesson history."
"""

import logging
import re

from beanie import PydanticObjectId

from app.db.models.knowledge_graph import KnowledgeEdge, RelationType

logger = logging.getLogger(__name__)

# Common crypto assets for entity extraction
_ASSET_PATTERN = re.compile(
    r"\b(BTC|ETH|SOL|XRP|DOGE|ADA|DOT|AVAX|LINK|MATIC|BNB|LTC|UNI|AAVE|OP|ARB)\b",
    re.IGNORECASE,
)


def extract_assets(text: str) -> list[str]:
    """Extract crypto asset symbols from text."""
    if not text:
        return []
    return list({m.upper() for m in _ASSET_PATTERN.findall(text)})


async def build_strategy_edges(
    strategy_id: PydanticObjectId,
    strategy_data: dict,
) -> list[KnowledgeEdge]:
    """Build knowledge graph edges for a newly created strategy."""
    edges: list[KnowledgeEdge] = []

    # Extract assets from description, entry/exit rules
    text_fields = [
        strategy_data.get("description", ""),
        strategy_data.get("entry_rules", ""),
        strategy_data.get("exit_rules", ""),
    ]
    all_text = " ".join(str(f) for f in text_fields if f)
    assets = extract_assets(all_text)

    # Also include explicit asset classes
    if asset_classes := strategy_data.get("asset_classes"):
        for ac in asset_classes:
            normalized = ac.upper().replace("-USDT", "")
            if normalized not in assets:
                assets.append(normalized)

    for asset in assets:
        edge = KnowledgeEdge(
            source_id=strategy_id,
            source_collection="strategy_knowledge",
            target_id=strategy_id,  # Self-reference for asset tag
            target_collection="assets",
            relation_type=RelationType.APPLIES_TO,
            metadata={"asset": asset},
        )
        edges.append(edge)

    if edges:
        await KnowledgeEdge.insert_many(edges)
    return edges


async def build_lesson_edges(
    lesson_id: PydanticObjectId,
    lesson_data: dict,
) -> list[KnowledgeEdge]:
    """Build knowledge graph edges for a newly created trade lesson."""
    edges: list[KnowledgeEdge] = []

    # Link lesson to its order if present
    if order_id := lesson_data.get("order_id"):
        edges.append(
            KnowledgeEdge(
                source_id=lesson_id,
                source_collection="trade_lessons",
                target_id=PydanticObjectId(str(order_id)),
                target_collection="orders",
                relation_type=RelationType.LEARNED_FROM,
                metadata={"symbol": lesson_data.get("symbol", "")},
            )
        )

    if edges:
        await KnowledgeEdge.insert_many(edges)
    return edges


async def build_pattern_edges(
    pattern_id: PydanticObjectId,
    pattern_data: dict,
) -> list[KnowledgeEdge]:
    """Build knowledge graph edges for a newly created pattern."""
    edges: list[KnowledgeEdge] = []

    # Link pattern to symbols it applies to
    symbols = pattern_data.get("symbols", []) or []
    for symbol in symbols:
        normalized = symbol.upper().replace("-USDT", "")
        edges.append(
            KnowledgeEdge(
                source_id=pattern_id,
                source_collection="trading_patterns",
                target_id=pattern_id,  # Self-reference for asset tag
                target_collection="assets",
                relation_type=RelationType.DETECTED_IN,
                metadata={"asset": normalized},
            )
        )

    if edges:
        await KnowledgeEdge.insert_many(edges)
    return edges


async def build_news_edges(
    article_id: PydanticObjectId,
    article_data: dict,
) -> list[KnowledgeEdge]:
    """Build knowledge graph edges for a news article."""
    edges: list[KnowledgeEdge] = []

    # Link article to mentioned assets
    assets = article_data.get("mentioned_assets", []) or []
    for asset in assets:
        edges.append(
            KnowledgeEdge(
                source_id=article_id,
                source_collection="news_articles",
                target_id=article_id,  # Self-reference for asset tag
                target_collection="assets",
                relation_type=RelationType.MENTIONS,
                metadata={"asset": asset.upper()},
            )
        )

    if edges:
        await KnowledgeEdge.insert_many(edges)
    return edges


async def find_related(
    entity_id: PydanticObjectId,
    relation_types: list[RelationType] | None = None,
    direction: str = "outgoing",
    limit: int = 20,
) -> list[KnowledgeEdge]:
    """Find edges connected to an entity.

    Args:
        entity_id: The entity to search from.
        relation_types: Filter by relation types (None = all).
        direction: "outgoing" (from entity), "incoming" (to entity), or "both".
        limit: Max edges to return.
    """
    filters: list[dict] = []

    if direction in ("outgoing", "both"):
        f: dict = {"source_id": entity_id}
        if relation_types:
            f["relation_type"] = {"$in": [r.value for r in relation_types]}
        filters.append(f)

    if direction in ("incoming", "both"):
        f = {"target_id": entity_id}
        if relation_types:
            f["relation_type"] = {"$in": [r.value for r in relation_types]}
        filters.append(f)

    if not filters:
        return []

    query = {"$or": filters} if len(filters) > 1 else filters[0]
    return await KnowledgeEdge.find(query).sort(-KnowledgeEdge.created_at).limit(limit).to_list()


async def find_by_asset(
    asset: str,
    collection_filter: str | None = None,
    limit: int = 20,
) -> list[KnowledgeEdge]:
    """Find all knowledge edges related to a specific asset symbol."""
    query: dict = {"metadata.asset": asset.upper()}
    if collection_filter:
        query["source_collection"] = collection_filter
    return await KnowledgeEdge.find(query).sort(-KnowledgeEdge.created_at).limit(limit).to_list()


async def get_asset_connections(asset: str) -> dict[str, list[PydanticObjectId]]:
    """Get all entity IDs connected to an asset, grouped by collection."""
    edges = await find_by_asset(asset, limit=100)
    connections: dict[str, list[PydanticObjectId]] = {}
    for edge in edges:
        col = edge.source_collection
        if col not in connections:
            connections[col] = []
        if edge.source_id not in connections[col]:
            connections[col].append(edge.source_id)
    return connections
