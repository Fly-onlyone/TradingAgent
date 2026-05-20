---
tags: [backend, agent]
---

# ClaudeSDKClient Wrapper

> Shared factory and workload semaphore that every Claude-SDK-driven caller uses to build an SDK client with project-standard options.

## Source

- `backend/app/agent/sdk_client.py`

## How it works

`build_sdk_client()` constructs `ClaudeAgentOptions` with the mandatory `SUPPRESS_CLI_HOOKS`, the standard `DISALLOWED_BUILTIN_TOOLS`, a stderr logger that forwards CLI noise to app logs, and an API key from [[Agent Auth]]. Callers own the `connect()` / `query()` / `disconnect()` lifecycle.

`claude_sdk_workload_slot()` is an async context manager backed by a per-event-loop semaphore (capacity 1). It serializes concurrent SDK workloads because overlapping `query + receive_response` calls crash the local Claude CLI subprocess on Windows.

`collect_text_response()` drains the stream into a single string and raises `RuntimeError` on `ResultMessage.is_error`. It is the standard helper for one-shot subagent calls.

## Depends on

- [[claude-agent-sdk]], [[ClaudeSDKClient]]
- [[Agent Auth]]
- `app.agent.constants` — `SUPPRESS_CLI_HOOKS`, `DISALLOWED_BUILTIN_TOOLS`

## Used by

- [[TradingAgent]] (uses the semaphore directly)
- [[TechnicalAnalyst]], [[FundamentalAnalyst]], [[NewsAnalyst]], [[StrategyExplorer]]

## Gotchas

- The semaphore is keyed by `id(asyncio.get_running_loop())` — short-lived loops leak entries (acceptable for one-shot scripts).
- `SUPPRESS_CLI_HOOKS` is non-optional per [[Chat-Session Checklist]]: omitting it makes the user-level Stop hook fire toasts on every subagent turn.

## See also

- [[_index]]
- [[TradingAgent]]
