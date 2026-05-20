---
tags: [pattern]
---

# AI Service Auth

> Any service that calls an LLM must resolve **provider + auth mode** through the central helper, never construct a client directly.

## When to apply

Any service that imports `anthropic`, `claude-agent-sdk`, or `openai`.

## The three-state matrix

[[App Settings]] `agent_provider` × auth-mode picks one of three runtime configurations:

| Provider | Auth mode | Client used |
|----------|-----------|-------------|
| `ANTHROPIC` | `API_KEY` | `Anthropic(api_key=...)` |
| `ANTHROPIC` | `SUBSCRIPTION` | [[ClaudeSDKClient]] via [[claude-agent-sdk]] |
| `OPENAI` | `API_KEY` (only) | `openai.AsyncOpenAI(api_key=...)` |

OpenAI has no subscription mode — the UI hides the auth-mode toggle when `agent_provider == OPENAI` and renders a dedicated API-key field instead.

## The pattern

```python
class MyService:
    def __init__(self, anthropic_key: str = "", openai_key: str = "", use_sdk: bool = False):
        self._provider = "openai" if openai_key else "anthropic"
        self._use_sdk = use_sdk and self._provider == "anthropic"
        if self._provider == "openai":
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=openai_key)
        elif anthropic_key and not use_sdk:
            from anthropic import Anthropic
            self._client = Anthropic(api_key=anthropic_key)
        else:
            self._client = None  # subscription mode — call via ClaudeSDKClient

    @classmethod
    async def create(cls) -> "MyService":
        from app.agent.auth import resolve_active_provider_api_key
        provider, key = await resolve_active_provider_api_key()
        if provider == "openai":
            return cls(openai_key=key)
        if key:
            return cls(anthropic_key=key)
        return cls(use_sdk=True)
```

`resolve_active_provider_api_key()` reads `agent_provider` from settings, then resolves the matching key via [[Agent Auth]] (`resolve_openai_api_key` or `resolve_anthropic_api_key`).

Reference services: [[StrategyExtractor]], [[Trade Learner]], NewsSummarizer, [[Context Generator]].

## Why

- Users may run the app without any API key — the Claude Code subscription provides AI access via [[claude-agent-sdk]] as a fallback when provider is Anthropic.
- The same service code must work under any of the three runtime configurations.
- Centralising provider + key resolution in [[Agent Auth]] keeps every caller honest about the order of resolution (DB → env → empty).

## Don't

- Don't instantiate `Anthropic(api_key=...)`, `AsyncAnthropic(...)`, or `openai.OpenAI(...)` directly without going through the `create()` factory.
- Don't hardcode model IDs in side services — read from settings (the hardcoded `claude-sonnet-4-6` in `news/summarizer.py:40` was a bug, now fixed).
- Don't skip the `create()` factory — direct constructor calls bypass auth resolution and provider selection.

## See also

- [[_index]]
- [[create() Factory Pattern]]
- [[Anthropic API]]
- [[OpenAI API]]
- [[Agent Auth]]
- [[OpenAIAgentRunner]]
