---
tags: [integrations]
---

# Anthropic API

> Claude API for AI features — operates in dual auth mode (API key or Claude Code subscription).

## Used for

- Strategy extraction ([[StrategyExtractor]])
- Trade learning ([[Trade Learner]])
- News summarization
- Contextual embedding prefix generation ([[Context Generator]])

## Configuration

- `anthropic>=0.102.0` SDK
- API key stored encrypted in [[App Settings]] or `ANTHROPIC_API_KEY` env var
- Context7 ID: `/anthropics/anthropic-sdk-python`

## Gotchas

- Never instantiate `Anthropic(api_key=...)` directly — always use the [[AI Service Auth]] `create()` factory so subscription mode works when no key is set
- Subscription mode routes through [[claude-agent-sdk]] / [[ClaudeSDKClient]] instead

## See also

- [[_index]]
- [[claude-agent-sdk]]
- [[AI Service Auth]]
