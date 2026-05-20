---
tags: [backend, knowledge]
---

# Knowledge Graph Builder

> Writes typed `KnowledgeEdge` documents during entity creation, enabling
> multi-hop queries like "strategies that work for BTC in bearish markets
> with a profitable lesson history".

## Source

- `backend/app/knowledge/graph.py`

## How it works

Four `build_*_edges()` functions run during document inserts to populate
[[KnowledgeEdge Model]] rows with a `RelationType`:

- `build_strategy_edges` → `APPLIES_TO` edges from strategies to extracted assets.
- `build_lesson_edges` → `LEARNED_FROM` edges from lessons to their `Order`.
- `build_pattern_edges` → `DETECTED_IN` edges from patterns to their target symbols.
- `build_news_edges` → `MENTIONS` edges from articles to mentioned assets.

`extract_assets(text)` uses a regex of the 16 most-traded crypto tickers
(BTC, ETH, SOL, …) — asset entries are deduplicated and uppercased. Asset
nodes are tag-style self-references (target collection `"assets"`, target_id
= source_id) with the asset symbol in `metadata.asset`. Traversal helpers
`find_related`, `find_by_asset`, `get_asset_connections` return edges or
grouped collections for the agent's reasoning tools.

## Depends on

- [[KnowledgeEdge Model]]

## Used by

- Strategy / lesson / pattern / news write paths
- Knowledge tools that surface "what else is connected to BTC?"

## Gotchas

- Asset extraction is regex-only and won't catch newer or less-mainstream tickers — add to `_ASSET_PATTERN` when needed.

## See also

- [[_index]]
- [[KnowledgeEdge Model]]
