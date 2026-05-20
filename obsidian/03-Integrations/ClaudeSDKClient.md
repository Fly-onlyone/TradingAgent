---
tags: [integrations]
---

# ClaudeSDKClient

> Main client class from [[claude-agent-sdk]] used by [[TradingAgent]] and subagents.

## Used for

- Streaming Claude responses into agent sessions
- Tool-use loop for the trading agent and analysts
- Subscription-mode fallback for services like [[StrategyExtractor]] and [[Trade Learner]] when no API key is set

## Configuration

- Constructed with `ClaudeAgentOptions(...)`
- Every options instance must include `extra_args={"setting-sources": "local"}`

## Gotchas

- Forgetting `setting-sources: local` causes user-level Stop hooks to fire on every subagent turn — see [[setting-sources local Pattern]]
- Subagents must NOT create their own `AgentSession` — they are pure compute, the parent's session captures the timeline

## See also

- [[_index]]
- [[claude-agent-sdk]]
- [[Subagent Delegation Pattern]]
