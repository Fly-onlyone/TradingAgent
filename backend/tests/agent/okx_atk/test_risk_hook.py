"""Tests for okx_atk.risk_hook — the trade-write gate.

The plan calls out 13 review-driven verification gates; the ones below cover
the hook logic in isolation (no DB / no subprocess). End-to-end gates that
need a live OKX demo are in Phase 7.3 verification.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agent.okx_atk import risk_hook as rh
from app.agent.okx_atk.risk_hook import atk_pretool_hook, invalidate_settings_cache


@pytest.fixture(autouse=True)
def _settings_cache_reset() -> None:
    invalidate_settings_cache()
    yield
    invalidate_settings_cache()


@pytest.fixture
def fake_settings_proceed(monkeypatch):
    """AppSettings with sandbox off; pin max_leverage to a real int so int<->int comparisons work."""
    settings = MagicMock()
    settings.okx_sandbox = False
    settings.max_leverage = rh.MAX_LEVERAGE_CAP  # real int, not MagicMock
    monkeypatch.setattr(rh, "_settings", AsyncMock(return_value=settings))
    return settings


@pytest.fixture
def atk_accepting(monkeypatch):
    """Process manager reports accepting=True (not in sandbox-toggle drain)."""
    mgr = MagicMock()
    mgr.is_accepting.return_value = True
    monkeypatch.setattr("app.agent.okx_atk.process_manager.get_manager", lambda: mgr)
    return mgr


@pytest.mark.asyncio
async def test_read_tool_passes_through(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__market_get_ticker",
        tool_input={"instId": "BTC-USDT"},
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_write_with_no_user_id_denies(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "10"},
        user_id=None,
    )
    assert decision["decision"] == "deny"
    assert "no user_id" in decision["reason"]


@pytest.mark.asyncio
async def test_place_with_no_recognized_size_alias_denies(
    fake_settings_proceed, atk_accepting
) -> None:
    """Fail-closed: hook MUST deny when no SIZE_ALIAS matches (unknown shape)."""
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "no recognized size alias" in decision["reason"]


@pytest.mark.asyncio
async def test_avoid_recommendation_denies(
    monkeypatch, fake_settings_proceed, atk_accepting
) -> None:
    """RiskManager returning AVOID MUST deny — this is the #1 critical fix."""
    fake_rm = MagicMock()
    fake_rm.assess_trade_risk = AsyncMock(
        return_value={"recommendation": "AVOID", "warnings": ["RSI overbought"]}
    )
    monkeypatch.setattr(rh, "RiskManager", lambda: fake_rm)
    monkeypatch.setattr(
        "app.agent.okx_atk.risk_hook._check_idempotency",
        AsyncMock(return_value=None),
    )

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "0.01"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "AVOID" in decision["reason"]
    assert "RSI overbought" in decision["reason"]


@pytest.mark.asyncio
async def test_proceed_recommendation_allows(
    monkeypatch, fake_settings_proceed, atk_accepting
) -> None:
    fake_rm = MagicMock()
    fake_rm.assess_trade_risk = AsyncMock(return_value={"recommendation": "PROCEED"})
    monkeypatch.setattr(rh, "RiskManager", lambda: fake_rm)
    monkeypatch.setattr(
        "app.agent.okx_atk.risk_hook._check_idempotency",
        AsyncMock(return_value=None),
    )

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "0.01"},
        user_id="650000000000000000000aaa",
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_caution_recommendation_allows(
    monkeypatch, fake_settings_proceed, atk_accepting
) -> None:
    """CAUTION is a flag, not a block — must allow."""
    fake_rm = MagicMock()
    fake_rm.assess_trade_risk = AsyncMock(
        return_value={"recommendation": "CAUTION", "warnings": ["high vol"]}
    )
    monkeypatch.setattr(rh, "RiskManager", lambda: fake_rm)
    monkeypatch.setattr(
        "app.agent.okx_atk.risk_hook._check_idempotency",
        AsyncMock(return_value=None),
    )

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "0.01"},
        user_id="650000000000000000000aaa",
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_transfer_in_xrp_denies(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__account_transfer",
        tool_input={"ccy": "XRP", "amt": "10", "from": "6", "to": "18"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "not in cap allowlist" in decision["reason"]


@pytest.mark.asyncio
async def test_transfer_exceeds_usd_cap_denies(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__account_transfer",
        tool_input={"ccy": "USDT", "amt": "100000", "from": "6", "to": "18"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "exceeds cap" in decision["reason"]


@pytest.mark.asyncio
async def test_transfer_under_cap_allows(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__account_transfer",
        tool_input={"ccy": "USDT", "amt": "100", "from": "6", "to": "18"},
        user_id="650000000000000000000aaa",
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_leverage_over_cap_denies(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__swap_set_leverage",
        tool_input={"instId": "BTC-USDT-SWAP", "lever": 125, "mgnMode": "cross"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "leverage 125 exceeds cap" in decision["reason"]


@pytest.mark.asyncio
async def test_leverage_under_cap_allows(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__swap_set_leverage",
        tool_input={"instId": "BTC-USDT-SWAP", "lever": 5, "mgnMode": "cross"},
        user_id="650000000000000000000aaa",
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_cancel_tool_allows_and_logs(fake_settings_proceed, atk_accepting) -> None:
    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_cancel_order",
        tool_input={"instId": "BTC-USDT", "ordId": "12345"},
        user_id="650000000000000000000aaa",
    )
    assert decision == {"decision": "allow"}


@pytest.mark.asyncio
async def test_bot_in_demo_denies_with_clear_reason(monkeypatch, atk_accepting) -> None:
    sandbox_settings = MagicMock()
    sandbox_settings.okx_sandbox = True
    monkeypatch.setattr(rh, "_settings", AsyncMock(return_value=sandbox_settings))

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__grid_create_order",
        tool_input={
            "instId": "BTC-USDT",
            "algoOrdType": "grid",
            "maxPx": "70000",
            "minPx": "60000",
            "gridNum": "10",
            "quoteSz": "100",
        },
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "demo trading" in decision["reason"]


@pytest.mark.asyncio
async def test_atk_not_accepting_denies_with_retry_hint(monkeypatch) -> None:
    settings = MagicMock()
    settings.okx_sandbox = False
    monkeypatch.setattr(rh, "_settings", AsyncMock(return_value=settings))
    mgr = MagicMock()
    mgr.is_accepting.return_value = False
    monkeypatch.setattr("app.agent.okx_atk.process_manager.get_manager", lambda: mgr)

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "0.01"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "retry in 5s" in decision["reason"]


@pytest.mark.asyncio
async def test_settings_db_failure_denies(monkeypatch, atk_accepting) -> None:
    """If AppSettings is unreachable for a write, fail closed."""
    monkeypatch.setattr(rh, "_settings", AsyncMock(side_effect=RuntimeError("mongo down")))

    decision = await atk_pretool_hook(
        tool_name="mcp__okx__spot_place_order",
        tool_input={"instId": "BTC-USDT", "side": "buy", "sz": "0.01"},
        user_id="650000000000000000000aaa",
    )
    assert decision["decision"] == "deny"
    assert "settings unavailable" in decision["reason"]
