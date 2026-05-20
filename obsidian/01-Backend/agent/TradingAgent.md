---
tags: [backend, agent]
---

# TradingAgent

> The main user-facing trading agent — a Claude-SDK-driven loop that orchestrates analysis, knowledge lookup, and order execution via in-process MCP tools.

## Source

- `backend/app/agent/trading_agent.py`

## How it works

`TradingAgent` wraps a single [[ClaudeSDKClient]] configured with the trading MCP server (see [[MCP Tools]]). On `connect()` it pulls auth via [[Agent Auth]], reads model/thinking/effort from [[App Settings]], and applies the project-required `SUPPRESS_CLI_HOOKS` flag.

`chat()` streams `AssistantMessage`, `StreamEvent`, and `ResultMessage` items from the SDK, capturing tool calls, thinking blocks, and partial text deltas with bounded memory. Every turn runs inside `claude_sdk_workload_slot` to serialize CLI subprocesses on Windows.

`analyze()` prefers the structured payload from the `submit_recommendation` MCP tool, falling back to regex extraction of action/confidence/prices from free-form text. `execute_trade()` delegates to [[OrderExecutor]] with an idempotency key.

## Depends on

- [[ClaudeSDKClient Wrapper]] — shared options + stderr logger
- [[MCP Tools]] — provides the in-process MCP server + buffered chart/recommendation/tool-result state
- [[Agent Auth]] — API key resolution
- [[OrderExecutor]] — trade execution
- [[claude-agent-sdk]], [[Anthropic API]]
- [[App Settings]] — `agent_model`, `agent_thinking_*`, `agent_effort`

## Used by

- Agent WebSocket route
- [[Task Scheduler]] — creates a fresh agent per task run

## Gotchas

- On Windows the module monkey-patches `anyio.open_process` to hide the Claude CLI console window.
- Tool calls per turn are capped at 32; thinking buffer at 12k chars.

## See also

- [[_index]]
- [[Trading Decision Flow]]
- [[Subagent Delegation Pattern]]
