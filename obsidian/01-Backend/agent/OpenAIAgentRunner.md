---
tags: [backend, agent]
---

# OpenAIAgentRunner

> OpenAI-side counterpart to [[ClaudeSDKClient Wrapper]]. Lives in `backend/app/agent/openai_client.py`. Implements the same callback contract so the rest of the codebase doesn't care which provider is active.

## Selected by

[[App Settings]] field `agent_provider == AgentProvider.OPENAI`. The dispatch happens in `backend/app/agent/trading_agent.py`, which branches on the provider in `connect / chat / disconnect / cancel`. The shared `build_sdk_client()` in `backend/app/agent/sdk_client.py` documents the routing but the actual branch is inside [[TradingAgent]].

## What it does

- Streams responses from OpenAI's Chat Completions API with `stream=True`.
- Translates MCP tools registered on the Claude SDK MCP server into OpenAI's `tools=[{"type": "function", ...}]` schema (see `translate_mcp_tools_to_openai`).
- Runs the tool-use loop: on each `tool_calls` delta it dispatches the named MCP tool, packs the result back into the next request, and resumes streaming.
- Emits the same `text_delta` / `tool_use` / `tool_result` events the Anthropic path emits — callers see no difference.

## Sibling class

[[OpenAITextClient]] — the one-shot variant for side services (StrategyExtractor, NewsSummarizer, Trade Learner, ContextGenerator). No streaming, no tools, no session — just `chat.completions.create()` with a system prompt and user message.

## Chat-Session 10-leg compliance

Pass on all ten legs of the [[Chat-Session Checklist]] — the runner is intentionally callback-only:

1. **persist_session_message** — caller-side, identical to the Anthropic path
2. **Live stream** — `text_delta` events emitted from the streaming loop
3. **Sidebar spinner** — caller-side
4. **In-place updates** — caller-side
5. **Stable message id** — caller-side
6. **`setting-sources: local`** — N/A, no Claude CLI involved
7. **Completion toast** — caller-side
8. **Failure visibility** — exceptions surface to caller; same retry semantics
9. **UI surfaces (sidebar, transcript, etc.)** — caller-side
10. **Strategy shadow doc** — caller-side

## Subagent contract

Per [[Subagent Delegation Pattern]], subagents follow the parent's provider. They never instantiate their own session and they never own a provider choice — they receive dicts, return dicts, and run on whatever client the parent built.

## Gotchas

- No thinking deltas (Chat Completions does not stream reasoning). UI must not assume `thinking_delta` events arrive for OpenAI.
- Permissive tool schemas (`additionalProperties: true`) — the model relies on the SYSTEM_PROMPT for tool semantics, not the JSON schema.
- Model ID `gpt-5.5` is GA since 2026-04-24 and is the user-specified target. 1M context window. Accepts `reasoning_effort` values `none`, `low`, `medium`, `high`, `xhigh` (not `"minimal"`). Translation from Anthropic's `agent_thinking_mode` × `agent_effort` happens in `translate_thinking_to_openai_effort()` in `backend/app/agent/openai_client.py`.

## See also

- [[_index]]
- [[OpenAI API]]
- [[ClaudeSDKClient Wrapper]]
- [[TradingAgent]]
- [[AI Service Auth]]
- [[Chat-Session Checklist]]
- [[Subagent Delegation Pattern]]
