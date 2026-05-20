---
tags: [backend, services, ai]
---

# StrategyExtractor

> Claude-powered structured-data extractor — turns an article body into `ExtractedStrategy` fields.

## Source

- `backend/app/services/strategy_extractor.py`

## How it works

Dual-mode service ([[AI Service Auth]]): `StrategyExtractor.create()` resolves `resolve_anthropic_api_key()` and picks one of two paths. With an API key it calls `anthropic.Anthropic.messages.create()` against `claude-sonnet-4-6` with `tool_choice` forced to a `save_strategy` tool (precise, fast). Without a key it falls back to `ClaudeSDKClient` (subscription / CLI credentials) and parses a JSON block from the raw text response. The settings family alias (`sonnet` / `opus`) is mapped via `FAMILY_TO_API_MODEL` before being passed to the SDK — passing the raw alias silently returns empty text. `extra_args={"setting-sources": "local"}` (`SUPPRESS_CLI_HOOKS`) is set so Claude CLI Stop hooks don't fire on every extraction. Content is truncated to 30k characters. A status-message timeline is attached to the result for UI playback.

## Depends on

- [[Anthropic API]]
- [[AI Service Auth]]

## Used by

- [[Strategy Discovery Service]]
- [[Source Discovery]]
- [[Strategy Import Endpoints]]

## Gotchas

- The SDK path returns the placeholder `"Imported Strategy"` on parse failure — extractor subagents reject this so it never reaches the DB.
- `disconnect()` may raise `RuntimeError` (cancel-scope mismatch) which is intentionally swallowed.

## See also

- [[_index]]
- [[Strategy Discovery Service]]
