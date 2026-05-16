"""Long-lived stdio MCP client used by the OpenAI bridge.

Anthropic runtime DOES NOT use this client — claude-agent-sdk spawns its own
child from `mcp_servers["okx"]`. We keep ONE separate child here for the
OpenAI bridge so we don't pay stdio handshake latency per tool call.

Connect() is guarded by an asyncio.Lock + double-check so concurrent
callers (two simultaneous OpenAI requests at startup) don't both spawn a
child and leak the first one.
"""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.agent.okx_atk.process_manager import get_manager
from app.agent.okx_atk.types import AtkError


class AtkMcpClient:
    def __init__(self) -> None:
        self._session: ClientSession | None = None
        self._stack: AsyncExitStack | None = None
        self._tools: list[Any] = []
        self._connect_lock = asyncio.Lock()

    async def connect(self) -> None:
        if self._session is not None:
            return
        async with self._connect_lock:
            if self._session is not None:  # double-check after acquiring lock
                return
            argv = get_manager().stdio_argv()
            params = StdioServerParameters(command=argv[0], args=argv[1:])
            stack = AsyncExitStack()
            try:
                read, write = await stack.enter_async_context(stdio_client(params))
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                tools = (await session.list_tools()).tools
            except Exception:
                await stack.aclose()
                raise
            self._stack = stack
            self._session = session
            self._tools = tools

    async def list_tools(self) -> list[Any]:
        await self.connect()
        return list(self._tools)

    async def call_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        """Invoke an ATK tool. Returns {"content": [...]} on success, or
        {"error": AtkError, "content": [...]} on failure."""
        await self.connect()
        assert self._session is not None
        result = await self._session.call_tool(name, args)
        content = [c.text for c in result.content if hasattr(c, "text")]
        if result.isError:
            # ATK serializes structured error blocks as JSON-in-text per
            # ARCHITECTURE.md §7. Parse the first text block.
            envelope: dict[str, Any] = {}
            if content:
                import json

                try:
                    envelope = json.loads(content[0])
                except (json.JSONDecodeError, TypeError):
                    envelope = {"type": "unknown", "message": content[0]}
            return {"error": AtkError.from_atk_envelope(envelope), "content": content}
        return {"content": content}

    async def reconnect(self) -> None:
        await self.close()
        await self.connect()

    async def close(self) -> None:
        if self._stack:
            await self._stack.aclose()
        self._session = None
        self._stack = None
        self._tools = []


_instance: AtkMcpClient | None = None


def get_client() -> AtkMcpClient:
    global _instance
    if _instance is None:
        _instance = AtkMcpClient()
    return _instance


def _reset_for_tests() -> None:
    """Module-level test helper. Singletons + tests don't mix; use this in fixtures."""
    global _instance
    _instance = None
