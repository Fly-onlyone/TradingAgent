---
tags: [backend, agent, auth]
---

# Agent Auth

> Shared resolver for the Anthropic API key used by every Claude-SDK-driven path. Returns an empty string when no key is configured, letting the SDK fall back to Claude Code CLI subscription credentials.

## Source

- `backend/app/agent/auth.py`

## How it works

`resolve_anthropic_api_key()` walks three sources in priority order:

1. **AppSettings (DB)** — `app_settings.get_agent_api_key()` decrypts the stored key via [[Fernet Encryption]]. This is the canonical source — users set it in the admin UI.
2. **`ANTHROPIC_API_KEY` env var** — falls through to `get_settings().anthropic_api_key`.
3. **Empty string** — signals "use subscription mode"; downstream code lets the Agent SDK pick up Claude Code CLI credentials.

DB load failures are swallowed with a debug log so a transient mongo blip doesn't take down the agent. The function is awaited at every connect point — [[TradingAgent]] `connect`, [[ClaudeSDKClient Wrapper]] `build_sdk_client`, [[StrategyExplorer]] connect — so a key change in the DB propagates on the next call without a process restart.

This is one half of [[AI Service Auth]]; the other half is the `create()` factory pattern that flips services between `Anthropic(api_key=...)` and `ClaudeSDKClient` subscription mode.

## Depends on

- [[App Settings]] — encrypted `agent_api_key`
- [[Fernet Encryption]]
- `app.config.get_settings`

## Used by

- [[TradingAgent]]
- [[ClaudeSDKClient Wrapper]]
- [[StrategyExplorer]]
- Every dual-mode service in `app/services/` (see [[AI Service Auth]])

## See also

- [[_index]]
- [[AI Service Auth]]
