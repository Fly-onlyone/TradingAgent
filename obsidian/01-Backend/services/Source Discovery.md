---
tags: [backend, services, strategy-discovery]
---

# Source Discovery

> Legacy/parallel pipeline that uses Brave Search to register new `NewsSource` domains and extract strategies inline.

## Source

- `backend/app/services/source_discovery.py`

## How it works

`SourceDiscoveryService.discover_and_extract()` runs three hard-coded crypto queries against Brave Search, registers each result domain as a `NewsSource(source_type=BLOG, auto_discovered=True, strategy_extraction=True)`, probes common RSS feed paths via HEAD requests, then fetches the article body and pipes it through [[StrategyExtractor]]. Survivors are saved as [[StrategyKnowledge Model]] + embedding plus an inactive `Strategy` shadow. Hard caps `auto_discover_max_sources` — once reached, new sources stop being created but extraction continues. Cleanup at the end deletes excess oldest auto-discovered sources.

## Depends on

- [[StrategyExtractor]]
- [[AppSettings Model]] (`auto_discover_max_sources`, Brave API key)
- `NewsSource` model

## Used by

- Admin "Discover Sources" endpoints

## Gotchas

- Distinct from [[Strategy Discovery Service]] (the agentic Explorer/Extractor pipeline) — this is the older, query-driven flow that creates sources, not strategies.

## See also

- [[_index]]
