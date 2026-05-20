---
tags: [backend, agent, subagent]
---

# StrategyExtractor Agent

> Pure-compute subagent that turns one article into an `ExtractedStrategy`, with a heuristic confidence score — no `AgentSession`, no recorder.

## Source

- `backend/app/agent/subagents/strategy_extractor_agent.py`
- Underlying service: `backend/app/services/strategy_extractor.py`

## How it works

`StrategyExtractorAgent.run()` builds the dual-mode `StrategyExtractor` via its `create()` factory (API key or subscription mode — see [[AI Service Auth]]) and calls `extract_from_text()` on the article body. The result is an `ExtractionResult { extracted, confidence, error }`.

A static `_validate()` rejects placeholder names ("Imported Strategy") or missing `entry_rules`. `_score_confidence()` synthesizes a 0..1 score from field completeness (name, description length, entry/exit rules, risk params, timeframes, symbols, market conditions) — callers compare it against `AppSettings.auto_discover_min_confidence`.

By design this subagent does NOT spawn its own `AgentSession`. The parent [[StrategyExplorer]]'s session captures the delegation card via `record_delegation`, matching the existing analyst pattern.

## Depends on

- `app.services.strategy_extractor.StrategyExtractor` — dual-mode Claude client
- [[AI Service Auth]]
- [[App Settings]] — `auto_discover_min_confidence`

## Used by

- [[Strategy Auto-Discovery Cycle]] — orchestrator fans these out in parallel after [[StrategyExplorer]] returns candidates

## See also

- [[_index]]
- [[Subagent Delegation Pattern]]
