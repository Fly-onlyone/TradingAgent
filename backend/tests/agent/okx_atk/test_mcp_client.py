"""Tests for okx_atk.mcp_client.

The plan calls for a real-ATK smoke test gated on the binary being on PATH —
included here as `test_real_atk_lists_market_tools`, automatically skipped
when ATK isn't installed. The fast unit tests below cover the connect race,
error translation, and close idempotency without spawning a subprocess.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agent.okx_atk import mcp_client as mc
from app.agent.okx_atk.mcp_client import AtkMcpClient
from app.agent.okx_atk.types import AtkError


@pytest.fixture(autouse=True)
def _reset_singleton() -> None:
    mc._reset_for_tests()
    yield
    mc._reset_for_tests()


def _make_tool(name: str = "market_get_ticker") -> MagicMock:
    t = MagicMock()
    t.name = name
    t.description = "desc"
    t.inputSchema = {"type": "object", "properties": {}}
    return t


def _make_text_content(text: str) -> MagicMock:
    c = MagicMock()
    c.text = text
    return c


@pytest.fixture
def fake_session() -> MagicMock:
    session = MagicMock()
    session.initialize = AsyncMock()
    session.list_tools = AsyncMock(
        return_value=MagicMock(
            tools=[_make_tool("market_get_ticker"), _make_tool("spot_place_order")]
        )
    )
    return session


@pytest.fixture
def patched_stdio(monkeypatch, fake_session):
    """Patch stdio_client + ClientSession so connect() succeeds without a subprocess."""

    @asynccontextmanager
    async def fake_stdio_client(_params):
        yield (MagicMock(), MagicMock())

    @asynccontextmanager
    async def fake_client_session(_read, _write):
        yield fake_session

    monkeypatch.setattr("app.agent.okx_atk.mcp_client.stdio_client", fake_stdio_client)
    monkeypatch.setattr(
        "app.agent.okx_atk.mcp_client.ClientSession",
        lambda *_a, **_kw: fake_client_session(None, None),
    )
    monkeypatch.setattr(
        "app.agent.okx_atk.mcp_client.get_manager",
        lambda: MagicMock(stdio_argv=lambda **_kw: ["fake-okx-trade-mcp", "--modules", "market"]),
    )


@pytest.mark.asyncio
async def test_list_tools_returns_atk_names(patched_stdio) -> None:
    client = AtkMcpClient()
    try:
        names = [t.name for t in await client.list_tools()]
        assert "market_get_ticker" in names
        assert "spot_place_order" in names
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_concurrent_connect_only_initializes_once(monkeypatch, fake_session) -> None:
    """Race-test: 5 simultaneous connect() calls must only initialize the session once."""
    init_count = 0

    async def counting_initialize() -> None:
        nonlocal init_count
        init_count += 1
        await asyncio.sleep(0.05)  # give the race a window

    fake_session.initialize = counting_initialize

    @asynccontextmanager
    async def fake_stdio_client(_params):
        yield (MagicMock(), MagicMock())

    @asynccontextmanager
    async def fake_client_session(_read, _write):
        yield fake_session

    monkeypatch.setattr("app.agent.okx_atk.mcp_client.stdio_client", fake_stdio_client)
    monkeypatch.setattr(
        "app.agent.okx_atk.mcp_client.ClientSession",
        lambda *_a, **_kw: fake_client_session(None, None),
    )
    monkeypatch.setattr(
        "app.agent.okx_atk.mcp_client.get_manager",
        lambda: MagicMock(stdio_argv=lambda **_kw: ["fake", "--m", "market"]),
    )

    client = AtkMcpClient()
    try:
        await asyncio.gather(*(client.connect() for _ in range(5)))
        assert init_count == 1
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_call_tool_translates_error_envelope(patched_stdio, fake_session) -> None:
    envelope = {
        "type": "OkxApiError",
        "code": "51020",
        "message": "Order quantity invalid",
    }
    result = MagicMock()
    result.isError = True
    result.content = [_make_text_content(json.dumps(envelope))]
    fake_session.call_tool = AsyncMock(return_value=result)

    client = AtkMcpClient()
    try:
        out = await client.call_tool("spot_place_order", {"instId": "BTC-USDT"})
        assert "error" in out
        err = out["error"]
        assert isinstance(err, AtkError)
        assert err.category == "okx_rejection"
        assert err.code == "51020"
        assert err.message == "Order quantity invalid"
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_call_tool_success_returns_content(patched_stdio, fake_session) -> None:
    result = MagicMock()
    result.isError = False
    result.content = [_make_text_content("ok")]
    fake_session.call_tool = AsyncMock(return_value=result)

    client = AtkMcpClient()
    try:
        out = await client.call_tool("market_get_ticker", {"instId": "BTC-USDT"})
        assert "error" not in out
        assert out["content"] == ["ok"]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_close_is_idempotent(patched_stdio) -> None:
    client = AtkMcpClient()
    await client.connect()
    await client.close()
    await client.close()  # second close must not raise


@pytest.mark.skipif(not shutil.which("okx-trade-mcp"), reason="ATK not installed")
@pytest.mark.asyncio
async def test_real_atk_lists_market_tools() -> None:
    """End-to-end smoke against a real ATK process. Skipped in CI."""
    client = AtkMcpClient()
    try:
        names = [t.name for t in await client.list_tools()]
        assert "market_get_ticker" in names
        assert any(n.startswith("spot_") for n in names)
    finally:
        await client.close()
