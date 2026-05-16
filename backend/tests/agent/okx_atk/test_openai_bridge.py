"""Tests for okx_atk.openai_bridge."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agent.okx_atk import openai_bridge as ob
from app.agent.okx_atk.openai_bridge import (
    OPENAI_NAME_PREFIX,
    invoke_atk_tool,
    is_atk_tool,
    translate_mcp_tools_to_openai,
)


def _make_tool(name: str, description: str = "desc", schema: dict | None = None) -> MagicMock:
    t = MagicMock()
    t.name = name
    t.description = description
    t.inputSchema = schema if schema is not None else {"type": "object", "properties": {}}
    return t


@pytest.mark.asyncio
async def test_translate_prefixes_tool_names(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.agent.okx_atk.openai_bridge.get_client",
        lambda: MagicMock(list_tools=AsyncMock(return_value=[_make_tool("market_get_ticker")])),
    )
    out = await translate_mcp_tools_to_openai()
    assert len(out) == 1
    assert out[0]["function"]["name"] == "okx_market_get_ticker"
    assert out[0]["type"] == "function"


@pytest.mark.asyncio
async def test_translate_truncates_long_description(monkeypatch) -> None:
    long_desc = "x" * 5000
    monkeypatch.setattr(
        "app.agent.okx_atk.openai_bridge.get_client",
        lambda: MagicMock(
            list_tools=AsyncMock(return_value=[_make_tool("spot_place_order", long_desc)])
        ),
    )
    out = await translate_mcp_tools_to_openai()
    assert len(out[0]["function"]["description"]) == 1024


@pytest.mark.asyncio
async def test_translate_missing_input_schema_falls_back(monkeypatch) -> None:
    t = MagicMock()
    t.name = "spot_get_orders"
    t.description = "desc"
    t.inputSchema = None
    monkeypatch.setattr(
        "app.agent.okx_atk.openai_bridge.get_client",
        lambda: MagicMock(list_tools=AsyncMock(return_value=[t])),
    )
    out = await translate_mcp_tools_to_openai()
    assert out[0]["function"]["parameters"] == {"type": "object", "properties": {}}


@pytest.mark.asyncio
async def test_translate_swallows_listing_failure(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.agent.okx_atk.openai_bridge.get_client",
        lambda: MagicMock(list_tools=AsyncMock(side_effect=RuntimeError("no atk"))),
    )
    out = await translate_mcp_tools_to_openai()
    assert out == []


def test_is_atk_tool_prefix_match() -> None:
    assert is_atk_tool(f"{OPENAI_NAME_PREFIX}spot_place_order") is True
    assert is_atk_tool("submit_recommendation") is False
    assert is_atk_tool("get_account_balance") is False


@pytest.mark.asyncio
async def test_invoke_rejects_non_atk_name() -> None:
    out = await invoke_atk_tool("submit_recommendation", {})
    assert "error" in out


@pytest.mark.asyncio
async def test_invoke_propagates_hook_deny_and_cleans_stub(monkeypatch) -> None:
    monkeypatch.setattr(
        ob,
        "atk_pretool_hook",
        AsyncMock(return_value={"decision": "deny", "reason": "RiskManager: AVOID — RSI"}),
    )
    cleanup = AsyncMock()
    monkeypatch.setattr(ob, "cleanup_pending_stub", cleanup)
    out = await invoke_atk_tool(
        "okx_spot_place_order",
        {"instId": "BTC-USDT", "side": "buy", "sz": "0.01", "clOrdId": "sxx-yy"},
        user_id="650000000000000000000aaa",
    )
    assert out["error"] == "blocked_by_risk_hook"
    assert "AVOID" in out["reason"]
    cleanup.assert_awaited_once()


@pytest.mark.asyncio
async def test_invoke_allow_proxies_to_mcp_client(monkeypatch) -> None:
    monkeypatch.setattr(ob, "atk_pretool_hook", AsyncMock(return_value={"decision": "allow"}))
    mc = MagicMock()
    mc.call_tool = AsyncMock(return_value={"content": ["ticker data"]})
    monkeypatch.setattr("app.agent.okx_atk.openai_bridge.get_client", lambda: mc)
    out = await invoke_atk_tool("okx_market_get_ticker", {"instId": "BTC-USDT"}, user_id="u-1")
    assert out == {"content": ["ticker data"]}
    mc.call_tool.assert_awaited_once_with("market_get_ticker", {"instId": "BTC-USDT"})
