---
tags: [backend, agent, subagent]
---

# StrategyExplorer

> Agentic scout that runs a Claude tool-use loop against the Explorer MCP toolset to discover unseen strategy-article URLs, then returns a ranked candidate list for parallel extraction.

## Source

- `backend/app/agent/subagents/strategy_explorer.py`

## How it works

`StrategyExplorerAgent.run()` creates a dedicated [[AgentSession Model]] via [[Session Recorder]] so users can replay the scout's chat. It connects a [[ClaudeSDKClient]] scoped to the Explorer's MCP server (see [[Explorer Tools]]: `list_configured_sources`, `fetch_article`, `has_been_extracted`, `submit_candidates`, plus shared `search_web`/`search_news`).

`_collect_turns()` iterates `receive_response()`, flushing one assistant message per turn into the session through `persist_session_message` and broadcasting via the WebSocket so the UI streams live (with `keep_running=True` while tools are still in play — see [[Chat-Session Checklist]]). The loop terminates when the agent calls `submit_candidates` (capped at `_MAX_TURNS=20`).

The scout DOES NOT extract strategies itself — it returns `ArticleCandidate { url, title, reason }` for orchestrator fan-out to [[StrategyExtractor Agent]].

## Depends on

- [[Explorer Tools]]
- [[Session Recorder]] — `create_subagent_session`, `persist_session_message`
- [[Agent Auth]], [[ClaudeSDKClient Wrapper]]

## Used by

- [[Strategy Auto-Discovery Cycle]] orchestrator

## Gotchas

- If the agent stops without calling `submit_candidates`, the explorer returns `[]` — no salvage attempt.
- `on_session_created` hook stamps `cycle.explorer_session_id` immediately so the Tasks UI Explorer button enables right away.

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[Strategy Auto-Discovery Cycle]]
