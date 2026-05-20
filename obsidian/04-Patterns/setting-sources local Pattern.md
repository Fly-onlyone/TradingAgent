---
tags: [pattern]
---

# setting-sources local Pattern

> Every `ClaudeAgentOptions(...)` call MUST pass `extra_args={"setting-sources": "local"}`.

## When to apply

Anywhere the backend constructs [[ClaudeSDKClient]] options — [[TradingAgent]], subagents, [[StrategyExtractor]], [[Trade Learner]], background cycles, etc.

## The pattern

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(
    ...,
    extra_args={"setting-sources": "local"},
)
```

## Why

Without this flag, the Claude CLI loads user-level settings — including the user's Stop hook — which fires a Windows toast on every subagent turn. The local-only mode keeps subagent runs silent.

Audit: `grep -n 'ClaudeAgentOptions(' backend/` — every hit must include the flag.

## Don't

- Don't omit the flag on any new `ClaudeAgentOptions` construction
- Don't override `setting-sources` to anything else without explicit reason

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[claude-agent-sdk]]
