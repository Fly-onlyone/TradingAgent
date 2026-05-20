---
tags: [integrations]
---

# claude-agent-sdk

> Anthropic agent SDK with tool use, sessions, and hooks — powers [[TradingAgent]] and all subagents.

## Used for

- [[TradingAgent]] orchestration (chat sessions)
- Subagents: TechnicalAnalyst, FundamentalAnalyst, NewsAnalyst, RiskManager
- Tool-call delegation pattern ([[Subagent Delegation Pattern]])
- Fallback runtime when no Anthropic API key is configured (subscription mode)

## Configuration

- `claude-agent-sdk>=0.2.82,<1.0.0`
- Used via [[ClaudeSDKClient]]
- Requires [[ProactorEventLoop]] on Windows for subprocess spawning

## Gotchas

- Every `ClaudeAgentOptions(...)` MUST pass `extra_args={"setting-sources": "local"}` ([[setting-sources local Pattern]]) — otherwise user-level Stop hooks fire on each turn

## See also

- [[_index]]
- [[ClaudeSDKClient]]
- [[Anthropic API]]
