"""Shared helpers to build `ClaudeSDKClient` instances with project defaults.

Enforces `SUPPRESS_CLI_HOOKS` (required per `.claude/rules/code-guide.md`
"Chat-Session Features" leg) and centralizes API-key resolution. Callers
retain ownership of the lifecycle — `connect()`, `query()`, `disconnect()`.

Provider routing: ``build_provider_client()`` dispatches to either the
Anthropic-backed ``ClaudeSDKClient`` or the OpenAI-backed lightweight
text client based on ``AppSettings.agent_provider``. Tool-use agents
(TradingAgent) handle their own provider branching because the OpenAI
runtime requires MCP-tool translation; this helper covers the
text-only side services (NewsSummarizer, TaskMerger fallback, etc.).
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

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
_sdk_semaphores_by_loop: dict[int, asyncio.Semaphore] = {}


def _get_sdk_workload_semaphore() -> asyncio.Semaphore:
    """Return the SDK workload semaphore scoped to the active event loop."""
    loop = asyncio.get_running_loop()
    semaphore = _sdk_semaphores_by_loop.get(id(loop))
    if semaphore is None:
        semaphore = asyncio.Semaphore(1)
        _sdk_semaphores_by_loop[id(loop)] = semaphore
    return semaphore


@asynccontextmanager
async def claude_sdk_workload_slot(source: str):
    """Serialize Claude SDK workloads to avoid concurrent CLI-process crashes.

    The Claude SDK-backed paths in this app run through a local CLI subprocess on
    Windows. Overlapping `query + receive_response` workloads have been observed
    to fail with `Command failed with exit code 1 / Check stderr output`.
    """
    semaphore = _get_sdk_workload_semaphore()
    logger.debug("Waiting for Claude SDK workload slot: %s", source)
    async with semaphore:
        logger.debug("Acquired Claude SDK workload slot: %s", source)
        yield


def build_sdk_stderr_logger(source: str):
    """Return a callback that forwards Claude CLI stderr lines into app logs."""

    def _log_stderr(line: str) -> None:
        text = line.strip()
        if not text:
            return

        extra: dict[str, Any] = {"sdk_source": source}
        lowered = text.lower()
        if "error" in lowered or "failed" in lowered or "exception" in lowered:
            logger.error("Claude CLI stderr [%s]: %s", source, text, extra=extra)
        else:
            logger.warning("Claude CLI stderr [%s]: %s", source, text, extra=extra)

    return _log_stderr


async def build_sdk_client(
    *,
    system_prompt: str,
    model: str | None = None,
    max_turns: int = 1,
    permission_mode: str = "bypassPermissions",
    stderr_source: str = "ClaudeSDKClient",
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
    options.stderr = build_sdk_stderr_logger(stderr_source)

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
