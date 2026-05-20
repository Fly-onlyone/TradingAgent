---
tags: [backend, services, strategy-discovery]
---

# Strategy Dedup

> Post-extraction merge for parallel `StrategyExtractorAgent` output — groups by normalized name OR entry/exit rules fingerprint.

## Source

- `backend/app/services/strategy_dedup.py`

## How it works

Parallel extractor subagents can independently extract near-duplicate strategies from different sources. `merge_extractions()` walks `ExtractionEvidence` items and assigns each to a `MergedExtraction` bucket via TWO keys: a normalized `name` (lowercase + whitespace-collapsed) and a SHA-1 fingerprint of normalized `entry_rules + exit_rules`. An evidence matching either key joins the existing bucket so "RSI-14 Reversal" and "Rsi 14 reversal" still merge. The bucket keeps the first evidence's `extracted` payload but takes `max(confidence)` across the group. Source URLs, session ids, and article titles are merged without duplication — the first non-empty becomes `primary_source_url` / `primary_source_session_id` which the saved `StrategyKnowledge` deep-links to.

## Depends on

- `ExtractedStrategy` (from [[StrategyExtractor]])

## Used by

- [[Strategy Discovery Service]]

## Gotchas

- Rules fingerprint uses `hashlib.sha1(..., usedforsecurity=False)` — collision safety isn't relevant here, only speed.

## See also

- [[_index]]
- [[Strategy Discovery Service]]
