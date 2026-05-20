---
tags: [backend, agent, tools, mcp]
---

# MCP Tools

> The in-process MCP server that exposes ~40 `@tool`-decorated wrappers to [[TradingAgent]] — plus context vars for user/session routing, ask-user plumbing, recommendation buffering, and tool-result telemetry.

## Source

- `backend/app/agent/mcp_tools.py`

## How it works

`create_trading_mcp_server()` builds an `sdk_mcp_server` named `trading` over `ALL_TRADING_TOOLS` — every market/technical/fundamental/news/web/browser/knowledge/trading/task/settings/memory/ask-user/recommendation tool. Each wrapper:

1. Imports the underlying helper from `app.agent.tools.*`.
2. Calls it with parsed args.
3. JSON-encodes the result into the MCP content envelope.
4. Pushes timing + summary into `_tool_results[name]` via `_buffer_tool_result()` so [[TradingAgent]] can attach `result_summary` / `execution_time_ms` to the matching `ToolUseBlock`.

`ContextVar` slots (`_active_user_id`, `_active_session_id`, `_active_connection_id`) let MCP tools see who's calling without changing the SDK's tool signature. `mcp_ask_user` parks a Future in `_pending_questions`, persists the prompt on `AgentSession.active_pending_question`, and resumes via `resolve_user_answer()`. `mcp_submit_recommendation` stashes a structured trade rec under a `request_id` for `TradingAgent.analyze` to read.

## Depends on

- [[claude-agent-sdk]] — `@tool`, `create_sdk_mcp_server`
- Every `app.agent.tools.*` module
- `AgentSession` — for persisted pending questions

## Used by

- [[TradingAgent]] (`ALLOWED_TOOL_NAMES`, `create_trading_mcp_server`)

## Gotchas

- The `_last_chart_data` global is single-slot — concurrent agents would race; in practice the workload semaphore in [[ClaudeSDKClient Wrapper]] serializes them.

## See also

- [[_index]]
- [[Agent Tools Overview]]
- [[Explorer Tools]]
