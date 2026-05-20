---
tags: [backend, services, ai]
---

# Task Merger

> AI-powered consolidator that collapses multiple [[AgentTask Model]] documents into one without losing user intent.

## Source

- `backend/app/services/task_merger.py`

## How it works

Used by the `POST /agent/tasks/merge-duplicates` endpoint to deduplicate legacy tasks that accumulated before the single-task cap. Dual-mode via the [[AI Service Auth]] pattern (`create()` resolves API key vs SDK). Prompts Claude with the JSON summaries of every input task and forces the `save_merged_task` tool. The merge rules: UNION symbols, OR capability flags (trading/monitoring/use_subagents), pick the MOST CONSERVATIVE `risk_level`, default `agent_mode` to `ask` unless all inputs were `auto`, smallest non-null numeric caps. If Claude returns garbage, `_deterministic_merge()` performs the same rules in plain Python so the endpoint never hard-fails. `preferred_source_index` tells the endpoint which task's schedule to inherit.

## Depends on

- [[Anthropic API]]
- [[AI Service Auth]]
- [[AgentTask Model]]

## Used by

- [[Agent Tasks Endpoints]] (`POST /agent/tasks/merge-duplicates`)

## See also

- [[_index]]
- [[StrategyExtractor]]
