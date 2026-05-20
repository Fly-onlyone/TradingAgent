---
tags: [integrations]
---

# OpenAI API

> Alternate LLM provider — selectable when [[App Settings]] `agent_provider == OPENAI`. Drives every service that previously called Anthropic-only.

## Used for

- [[TradingAgent]] orchestration (chat sessions) via [[OpenAIAgentRunner]]
- [[StrategyExtractor]], [[Trade Learner]], NewsSummarizer, [[Context Generator]] — all switch providers based on `agent_provider`
- Subagents follow the parent's provider — no per-subagent override (see [[Subagent Delegation Pattern]])

## Model

- Family alias: `gpt-5-5` → API model ID `gpt-5.5` (GA since 2026-04-24; available in both Chat Completions and Responses APIs)
- Context window: **1M tokens** (declared in `frontend/src/components/agent/ChatInput.tsx`)
- Reasoning effort values accepted by `gpt-5.5`: `none`, `low`, `medium` (default), `high`, `xhigh` — **does NOT accept `"minimal"`**
- See [[OpenAIAgentRunner]] for the `agent_thinking_mode` × `agent_effort` → `reasoning_effort` mapping table

## Configuration

- `openai>=1.50.0` (uv resolved 2.x at install time)
- API key stored encrypted in [[App Settings]] (`openai_api_key`, member of `SECRET_FIELD_NAMES`) or `OPENAI_API_KEY` env var
- Context7 ID: `/openai/openai-python`

## API surface chosen

- **Chat Completions with streaming + function tools** — NOT the Responses API.
- Rationale: MCP tools map 1:1 to `tools=[{"type":"function",...}]`; `delta.content` chunks align with the frontend's existing `text_delta` event; tool-loop semantics are stable.
- Trade-off accepted: no thinking deltas (the Responses API would surface reasoning summaries). `reasoning_effort` is still passed for GPT-5-family models.

## Gotchas

- The MCP tool schemas are not introspectable from the Claude SDK server object, so [[OpenAIAgentRunner]] declares permissive `object` schemas with `additionalProperties: true`. A follow-up could mirror the real schemas for stricter validation — works today because the model has the SYSTEM_PROMPT for tool semantics.
- When the user flips `agent_provider`, `PUT /settings/agent` validates the chosen model belongs to the new provider; if not, it resets `agent_model` to the provider's default.
- Subscription mode does not exist for OpenAI — the UI hides the subscription / API-key toggle and renders a dedicated API-key field instead.

## See also

- [[_index]]
- [[OpenAIAgentRunner]]
- [[AI Service Auth]]
- [[Anthropic API]]
- [[Agent Auth]]
