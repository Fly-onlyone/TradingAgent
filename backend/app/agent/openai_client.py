"""OpenAI provider runtime for TradingAgent and side services.

API choice: **Chat Completions with streaming + function tools**.

Why Chat Completions and not Responses:
- The MCP tools defined in ``app.agent.mcp_tools`` already speak a
  function-call schema that maps 1:1 to Chat Completions ``tools=[{
  "type": "function", "function": {...} }]``. The Responses API uses a
  different ``output``/``output_item`` envelope that would require a
  second translation layer for every tool call.
- Streaming text deltas come back as ``choices[0].delta.content`` chunks
  which match the existing ``text_delta`` event the frontend already
  consumes from the Anthropic path.
- Tool-loop semantics (parallel tool calls, then a follow-up assistant
  turn with the results) are well-documented and stable.

Trade-off: we lose ``thinking`` deltas (Responses API exposes reasoning
summaries; Chat Completions does not). For GPT-5-family reasoning
effort, we still pass ``reasoning_effort`` so the model thinks, but the
internal trace is not surfaced. This is acceptable for v1 — the user
asked for an OpenAI swap, not for parity on the thinking UI.

Thinking-config mapping (Anthropic AppSettings → OpenAI):
- ``agent_thinking_mode = "adaptive"`` → omit ``reasoning_effort`` so the
  model uses its own default (``medium`` for gpt-5/5.2, ``none`` for
  gpt-5.1+).
- ``agent_thinking_mode = "disabled"`` → ``reasoning_effort = "none"``
  (supported on gpt-5.1 and later; on earlier models the call may error
  and the caller should switch to ``adaptive`` or pick a newer model).
- ``agent_thinking_mode = "enabled"`` → map ``agent_effort`` ("low",
  "medium", "high") through verbatim; ``"max"`` maps to ``"xhigh"``
  (supported on ``gpt-5.5`` and other post-``gpt-5.1-codex-max`` models).
  If a future model in the catalogue does not support ``xhigh``, swap
  the helper's ``"max"`` branch to ``"high"`` instead.
- ``agent_thinking_budget`` (token budget) has no OpenAI analogue —
  OpenAI uses effort levels, not budgets. It is silently ignored when
  the provider is OpenAI.

Chat-session 10-leg compliance:
- Persistence + live stream + completion toast happen in the *caller*
  (``backend/app/api/websocket/agent.py``), exactly like the Anthropic
  path. This runner only emits the structured events that surface in
  the chat sidebar; it never persists or broadcasts on its own.
- ``setting-sources: local`` does not apply (no Claude CLI).
- Subagents delegated by the parent still use this runner because the
  parent's session captures every delegation via tool-call bubbles.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

from app.agent.auth import resolve_openai_api_key

logger = logging.getLogger(__name__)


class OpenAIAuthError(RuntimeError):
    """Raised when no OpenAI API key is configured."""


_OPENAI_EFFORT_VALUES = frozenset({"none", "minimal", "low", "medium", "high", "xhigh"})


def translate_thinking_to_openai_effort(
    thinking_mode: str | None,
    effort: str | None,
) -> str | None:
    """Map Anthropic-style ``(thinking_mode, effort)`` to OpenAI ``reasoning_effort``.

    Returns ``None`` when the caller should omit the field so the model
    can fall back to its own default. See the module docstring for the
    full mapping table and per-model constraints.
    """
    mode = (thinking_mode or "").strip().lower()
    if mode == "adaptive" or not mode:
        return None
    if mode == "disabled":
        return "none"
    # mode == "enabled" (or any unrecognised value — treat as explicit effort)
    if not effort:
        return None
    level = effort.strip().lower()
    if level == "max":
        # gpt-5.5 supports "xhigh"; if a future model in the catalogue does
        # not, switch this branch back to "high".
        return "xhigh"
    if level in _OPENAI_EFFORT_VALUES:
        return level
    return None


def _import_openai_async_client():
    """Lazy import so the dependency is optional at module load time."""
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:  # pragma: no cover - hard dep, surfaced at runtime
        raise OpenAIAuthError(
            "OpenAI provider selected but the `openai` package is not installed. "
            "Run `uv sync` to install dependencies."
        ) from exc
    return AsyncOpenAI


async def build_openai_async_client(*, api_key: str | None = None):
    """Return an ``AsyncOpenAI`` instance with the resolved API key.

    Raises ``OpenAIAuthError`` when no key is configured — this is fatal
    for the OpenAI provider (no subscription fallback like Anthropic).
    """
    resolved = api_key if api_key is not None else await resolve_openai_api_key()
    if not resolved:
        raise OpenAIAuthError(
            "OpenAI provider selected but no API key is configured. "
            "Set OPENAI_API_KEY in .env or save a key via Settings → AI Agent."
        )
    client_cls = _import_openai_async_client()
    return client_cls(api_key=resolved)


# ── Side-service text helper ────────────────────────────────────


class OpenAITextClient:
    """Minimal text-completion wrapper used by NewsSummarizer / TaskMerger.

    Mirrors the surface area of :func:`app.agent.sdk_client.collect_text_response`:
    callers pass a system prompt + user message, get the assistant text back.
    """

    def __init__(self, client: Any, *, model: str) -> None:
        self._client = client
        self._model = model

    @classmethod
    async def create(cls, *, model: str) -> OpenAITextClient:
        client = await build_openai_async_client()
        return cls(client, model=model)

    async def complete(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_output_tokens: int = 1024,
    ) -> str:
        """Return the assistant text for a single turn."""
        completion = await self._client.chat.completions.create(
            model=self._model,
            max_completion_tokens=max_output_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        choice = completion.choices[0] if completion.choices else None
        if not choice or not choice.message or not choice.message.content:
            return ""
        return choice.message.content.strip()

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_output_tokens: int = 4096,
    ) -> str:
        """Return raw JSON text — equivalent to Anthropic's tool_choice JSON mode."""
        completion = await self._client.chat.completions.create(
            model=self._model,
            max_completion_tokens=max_output_tokens,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        choice = completion.choices[0] if completion.choices else None
        if not choice or not choice.message or not choice.message.content:
            return ""
        return choice.message.content.strip()


# ── Tool translation for the main TradingAgent path ─────────────


def translate_mcp_tools_to_openai(allowed_tool_names: list[str]) -> list[dict[str, Any]]:
    """Convert the in-process MCP tools to OpenAI ``tools`` schema entries.

    The Claude Agent SDK registers tools on a server object whose schema
    is not directly introspectable from outside the SDK. Rather than
    duplicate every schema, we expose a thin pass-through: each tool is
    declared with a permissive ``object`` schema and the executor reads
    real arguments from the model. This keeps the tool surface aligned
    with the Anthropic path without requiring a second source of truth.
    """
    tools: list[dict[str, Any]] = []
    for full_name in allowed_tool_names:
        # MCP tool names look like ``mcp__trading__<tool_name>`` — strip the
        # prefix so the OpenAI tool catalog stays readable.
        bare = full_name.split("__")[-1]
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": bare,
                    "description": f"Trading agent tool: {bare}",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": True,
                    },
                },
            }
        )
    return tools


# ── Main TradingAgent runtime ───────────────────────────────────


class OpenAIAgentRunner:
    """OpenAI-backed counterpart of :class:`TradingAgent`'s chat loop.

    Implements the same async ``chat(user_message, on_event=...)`` contract
    the existing WebSocket handler already drives for the Anthropic path.

    What it satisfies on the Chat-Session 10-leg checklist:
    1. Persistence — caller persists via ``persist_session_message`` (same as Anthropic).
    2. Live stream — emits ``text_delta`` / ``tool_call`` events through ``on_event``.
    3. Sidebar spinner — caller controls ``keep_running`` on WS payloads.
    4. In-place updates — out of scope for the runner (caller-side).
    5. Message id on wire — caller-side.
    6. Suppress Claude CLI hooks — N/A (no Claude CLI involved).
    7. Completion toast — caller-side (``websocket/agent.py``).
    8. Failure visibility — runner raises; caller try/except flips status.
    9. UI surfaces — frontend already reads the standard event shapes.
    10. Strategy shadow — caller-side.
    """

    def __init__(
        self,
        *,
        system_prompt: str,
        model: str,
        allowed_tool_names: list[str],
        reasoning_effort: str | None = None,
        max_tool_iterations: int = 10,
        session_id: str | None = None,
    ) -> None:
        self._system_prompt = system_prompt
        self._model = model
        self._reasoning_effort = reasoning_effort
        self._max_tool_iterations = max_tool_iterations
        self._tools = translate_mcp_tools_to_openai(allowed_tool_names)
        self._client: Any | None = None
        self._history: list[dict[str, Any]] = []
        self._cancel_event = asyncio.Event()
        self._session_id = session_id

        # Per-turn accumulators (mirrors TradingAgent.chat)
        self._tool_calls_this_turn: list[dict[str, Any]] = []
        self._thinking_content_this_turn = ""
        self._partial_response_this_turn = ""
        self._input_tokens = 0
        self._output_tokens = 0
        self._model_this_turn: str | None = None

    async def connect(self) -> None:
        if self._client is None:
            self._client = await build_openai_async_client()
            self._history = [{"role": "system", "content": self._system_prompt}]
            # Extend tool list with ATK tools via the MCP→OpenAI bridge.
            # Best-effort: if ATK isn't installed / process isn't running,
            # log + continue without ATK tools (native registry still works).
            try:
                from app.agent.okx_atk.openai_bridge import translate_mcp_tools_to_openai

                atk_tools = await translate_mcp_tools_to_openai()
                if atk_tools:
                    self._tools = [*self._tools, *atk_tools]
                    logger.info("OpenAI runner: loaded %d ATK tools via bridge", len(atk_tools))
            except Exception:
                logger.exception(
                    "OpenAI runner: ATK bridge tool-loading failed — continuing without ATK"
                )
            logger.info("OpenAI agent runner connected (model=%s)", self._model)

    async def disconnect(self) -> None:
        # AsyncOpenAI uses httpx under the hood; closing is idempotent.
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                logger.debug("OpenAI client close failed", exc_info=True)
            self._client = None

    def cancel(self) -> None:
        self._cancel_event.set()

    def reset_cancel(self) -> None:
        self._cancel_event.clear()

    async def _ensure_connected(self) -> None:
        if self._client is None:
            await self.connect()

    @property
    def tool_calls(self) -> list[dict[str, Any]]:
        return self._tool_calls_this_turn

    @property
    def thinking_content(self) -> str:
        return self._thinking_content_this_turn.strip()

    @property
    def partial_response(self) -> str:
        return self._partial_response_this_turn.strip()

    @property
    def input_tokens(self) -> int:
        return self._input_tokens

    @property
    def output_tokens(self) -> int:
        return self._output_tokens

    @property
    def model(self) -> str | None:
        return self._model_this_turn

    @property
    def session_id(self) -> str | None:
        return self._session_id

    async def _invoke_mcp_tool(self, bare_name: str, arguments: dict[str, Any]) -> str:
        """Dispatch a tool call to the in-process MCP tool registry.

        Walks the same trading MCP server the Anthropic path uses and
        invokes the matching tool by its bare name. Returns the tool's
        string output for inclusion in the next assistant turn.
        """
        from app.agent.mcp_tools import create_trading_mcp_server

        server = create_trading_mcp_server()
        # The SDK exposes a private ``_tools`` dict on the server object;
        # use the public ``call_tool`` when available, fall back otherwise.
        tool_fn: Callable[..., Any] | None = None
        candidates = (
            getattr(server, "tools", None),
            getattr(server, "_tools", None),
        )
        for registry in candidates:
            if isinstance(registry, dict):
                # Tools may be registered under the bare or fully-qualified name
                for key, value in registry.items():
                    if key == bare_name or key.endswith(f"__{bare_name}"):
                        tool_fn = value
                        break
            if tool_fn is not None:
                break

        if tool_fn is None:
            return json.dumps({"error": f"Unknown tool: {bare_name}"})

        try:
            result = (
                tool_fn(**arguments)
                if not asyncio.iscoroutinefunction(tool_fn)
                else await tool_fn(**arguments)
            )
        except Exception as exc:  # pragma: no cover - tool failures are reported
            logger.warning("OpenAI tool dispatch failed: %s", bare_name, exc_info=True)
            return json.dumps({"error": str(exc)})

        if isinstance(result, str):
            return result
        try:
            return json.dumps(result)
        except (TypeError, ValueError):
            return str(result)

    async def chat(
        self,
        user_message: str,
        on_event: Callable[[dict[str, Any]], Any] | None = None,
    ) -> str:
        """Drive one user turn through the OpenAI Chat Completions tool loop."""
        await self._ensure_connected()
        self.reset_cancel()
        self._tool_calls_this_turn = []
        self._thinking_content_this_turn = ""
        self._partial_response_this_turn = ""
        self._input_tokens = 0
        self._output_tokens = 0
        self._model_this_turn = None

        self._history.append({"role": "user", "content": user_message})

        final_text_parts: list[str] = []

        for iteration in range(self._max_tool_iterations):
            if self._cancel_event.is_set():
                logger.info("OpenAI agent chat cancelled by user")
                break

            request: dict[str, Any] = {
                "model": self._model,
                "messages": self._history,
                "tools": self._tools or None,
                "stream": True,
            }
            if self._reasoning_effort:
                request["reasoning_effort"] = self._reasoning_effort
            # Drop None to keep the request body clean.
            request = {k: v for k, v in request.items() if v is not None}

            stream = await self._client.chat.completions.create(**request)

            # Accumulators for this streamed assistant turn.
            assistant_text = ""
            # tool_calls keyed by index → {id, name, arguments}
            tool_call_buffer: dict[int, dict[str, Any]] = {}
            finish_reason: str | None = None

            async for chunk in stream:
                if self._cancel_event.is_set():
                    break
                if not chunk.choices:
                    if chunk.usage:
                        self._input_tokens += chunk.usage.prompt_tokens or 0
                        self._output_tokens += chunk.usage.completion_tokens or 0
                    continue
                choice = chunk.choices[0]
                self._model_this_turn = getattr(chunk, "model", None) or self._model_this_turn
                delta = choice.delta

                if delta and delta.content:
                    text_chunk = delta.content
                    assistant_text += text_chunk
                    self._partial_response_this_turn += text_chunk
                    if on_event:
                        await on_event(
                            {
                                "type": "text_delta",
                                "data": {"content": text_chunk},
                            }
                        )

                if delta and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        slot = tool_call_buffer.setdefault(
                            idx,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function.arguments:
                                slot["arguments"] += tc.function.arguments

                if choice.finish_reason:
                    finish_reason = choice.finish_reason

            # Record the assistant turn in history.
            if tool_call_buffer:
                history_tool_calls = [
                    {
                        "id": tc["id"] or f"call_{iteration}_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"] or "{}",
                        },
                    }
                    for i, tc in sorted(tool_call_buffer.items())
                ]
                self._history.append(
                    {
                        "role": "assistant",
                        "content": assistant_text or None,
                        "tool_calls": history_tool_calls,
                    }
                )
            elif assistant_text:
                self._history.append({"role": "assistant", "content": assistant_text})

            if assistant_text:
                final_text_parts.append(assistant_text)

            # Execute any tool calls and feed the results back.
            if not tool_call_buffer or finish_reason not in (None, "tool_calls"):
                # Nothing more to do.
                break

            for i, tc in sorted(tool_call_buffer.items()):
                if self._cancel_event.is_set():
                    break
                bare_name = tc["name"]
                arguments_raw = tc["arguments"] or "{}"
                try:
                    arguments = json.loads(arguments_raw)
                except json.JSONDecodeError:
                    arguments = {}

                tool_info = {
                    "id": tc["id"] or f"call_{iteration}_{i}",
                    "name": bare_name,
                    "arguments": arguments,
                }
                self._tool_calls_this_turn.append(tool_info)
                if on_event:
                    await on_event({"type": "tool_call", "data": tool_info})
                logger.info("OpenAI tool called: %s", bare_name)

                # Route by prefix — ATK tools go through the bridge (risk hook
                # + idempotency + MCP stdio proxy), everything else stays on
                # the in-process registry.
                from app.agent.context import current_user_id_var
                from app.agent.okx_atk.openai_bridge import (
                    invoke_atk_tool,
                    is_atk_tool,
                )

                if is_atk_tool(bare_name):
                    atk_result = await invoke_atk_tool(
                        bare_name,
                        arguments,
                        user_id=current_user_id_var.get(None),
                    )
                    # OpenAI's tool-result content must be a string.
                    if "error" in atk_result:
                        tool_result = (
                            f"ATK error: {atk_result.get('error')} — {atk_result.get('reason', '')}"
                        )
                    else:
                        tool_result = "\n".join(atk_result.get("content") or [])
                else:
                    tool_result = await self._invoke_mcp_tool(bare_name, arguments)
                self._history.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"] or f"call_{iteration}_{i}",
                        "content": tool_result,
                    }
                )

        final_response = "".join(final_text_parts).strip()
        if final_response:
            self._partial_response_this_turn = final_response
            return final_response
        return self._partial_response_this_turn.strip()
