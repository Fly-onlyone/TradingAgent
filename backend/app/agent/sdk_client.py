"""Shared helpers to build `ClaudeSDKClient` instances with project defaults.

Enforces `SUPPRESS_CLI_HOOKS` (required per `.claude/rules/code-guide.md`
"Chat-Session Features" leg) and centralizes API-key resolution. Callers
retain ownership of the lifecycle — `connect()`, `query()`, `disconnect()`.
"""

from __future__ import annotations

import logging

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
)

from app.agent.auth import resolve_anthropic_api_key
from app.agent.constants import DISALLOWED_BUILTIN_TOOLS, SUPPRESS_CLI_HOOKS

logger = logging.getLogger(__name__)


async def build_sdk_client(
    *,
    system_prompt: str,
    model: str | None = None,
    max_turns: int = 1,
    permission_mode: str = "bypassPermissions",
) -> ClaudeSDKClient:
    """Build an SDK client with project defaults and resolved auth.

    Caller is responsible for `connect()`, `query()`, and `disconnect()`.
    """
    option_kwargs: dict = {
        "system_prompt": system_prompt,
        "permission_mode": permission_mode,
        "disallowed_tools": DISALLOWED_BUILTIN_TOOLS,
        "max_turns": max_turns,
        "extra_args": SUPPRESS_CLI_HOOKS,
    }
    if model:
        option_kwargs["model"] = model
    options = ClaudeAgentOptions(**option_kwargs)

    api_key = await resolve_anthropic_api_key()
    if api_key:
        options.env["ANTHROPIC_API_KEY"] = api_key

    return ClaudeSDKClient(options=options)


async def collect_text_response(
    client: ClaudeSDKClient,
    *,
    source: str,
) -> str:
    """Drain the SDK response stream into a single joined string.

    Raises `RuntimeError` if the SDK emits a `ResultMessage` with
    `is_error=True`. Falls back to the `ResultMessage.result` text if no
    `AssistantMessage` text blocks were emitted.
    """
    parts: list[str] = []
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    parts.append(block.text)
        elif isinstance(message, ResultMessage):
            if message.is_error:
                raise RuntimeError(message.result or f"{source} SDK error")
            if message.result and not parts:
                parts.append(message.result)
    return "".join(parts)
