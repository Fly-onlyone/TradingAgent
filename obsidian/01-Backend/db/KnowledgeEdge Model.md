---
tags: [backend, db, model]
---

# KnowledgeEdge Model

> Directed edge linking two knowledge entities — the storage for the lightweight knowledge graph behind multi-hop RAG queries.

## Source

- `backend/app/db/models/knowledge_graph.py`
- Collection: `knowledge_edges`

## Key fields

- `source_id`, `source_collection`
- `target_id`, `target_collection`
- `relation_type: RelationType` — `APPLIES_TO`, `USED_IN`, `CORRELATED_WITH`, `DETECTED_IN`, `MENTIONS`, `CONTRADICTS`, `SUPPORTS`, `LEARNED_FROM`
- `weight: float`, `metadata: dict`

## Used by

- `graph.py` builder (called during document creation)
- [[Knowledge Graph Edges]] — multi-hop queries

## Special features

- Indexes on `(source_id, relation_type)` and `(target_id, relation_type)` for fan-out lookups
- Collection-pair index for type-aware traversal

## See also

- [[_index]]
- [[Knowledge Graph Edges]]
