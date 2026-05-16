"""Curated ATK module + tool lists.

ATK ships 159 tools across 17 modules. Some MCP clients (Cursor, possibly
others) cap at ~80 tools, so we pin a curated subset and prefix the names
with `mcp__okx__` for `ClaudeAgentOptions.allowed_tools`.

The categorized write-tool sets (PLACE / CANCEL / TRANSFER / LEVERAGE) drive
`risk_hook.atk_pretool_hook` dispatch. Unknown write tools fall through to
DENY (fail-closed contract).

The static lists below are inferred from `docs/module-registry.md` and
`docs/modules/*.md` in the ATK repo (v1.3.3). Pre-flight Task 0 dumps the
real `tools/list` from a live `okx-trade-mcp` and reconciles any drift.
"""

from __future__ import annotations

from typing import Final

# 75 tools — well under any client cap. Adjustable via AppSettings.atk_modules.
DEFAULT_MODULES: Final = "market,account,spot,swap,bot.grid,bot.dca,news,smartmoney"
MCP_SERVER_NAME: Final = "okx"  # appears in `mcp__<server>__<tool>`

# Tool inventory per module. Update when ATK adds tools. Source of truth is
# Pre-flight Task 0's `tools/list` dump.
ATK_TOOLS_BY_MODULE: Final[dict[str, list[str]]] = {
    "market": [
        "market_get_ticker",
        "market_get_tickers",
        "market_get_orderbook",
        "market_get_candles",
        "market_get_history_candles",
        "market_get_index_ticker",
        "market_get_index_candles",
        "market_get_price_limit",
        "market_get_funding_rate",
        "market_get_funding_rate_history",
        "market_get_mark_price",
        "market_get_open_interest",
        "market_get_oi_history",
        "market_get_oi_change_filter",
        "market_get_stock_tokens",
        "market_get_indicator",
        "market_list_indicators",
        "market_filter",
        "market_get_taker_volume",
    ],
    "account": [
        "account_get_balance",
        "account_get_positions",
        "account_get_positions_history",
        "account_get_bills",
        "account_get_bills_archive",
        "account_get_config",
        "account_get_max_size",
        "account_get_max_avail_size",
        "account_get_max_withdrawal",
        "account_get_fee_rates",
        "account_get_leverage",
        "account_set_leverage",
        "account_get_audit_log",
        "account_transfer",
    ],
    "spot": [
        "spot_place_order",
        "spot_cancel_order",
        "spot_amend_order",
        "spot_batch_place_orders",
        "spot_batch_cancel_orders",
        "spot_get_order",
        "spot_get_open_orders",
        "spot_get_order_history",
        "spot_get_order_history_archive",
        "spot_get_fills",
        "spot_get_fills_archive",
        "spot_place_algo_order",
        "spot_cancel_algo_order",
        "spot_get_algo_orders",
    ],
    "swap": [
        "swap_place_order",
        "swap_cancel_order",
        "swap_amend_order",
        "swap_batch_place_orders",
        "swap_batch_cancel_orders",
        "swap_get_order",
        "swap_get_open_orders",
        "swap_get_order_history",
        "swap_get_fills",
        "swap_get_positions",
        "swap_close_position",
        "swap_set_leverage",
        "swap_place_algo_order",
        "swap_cancel_algo_order",
        "swap_get_algo_orders",
        "swap_amend_algo_order",
        "move_order_stop",
    ],
    "bot.grid": [
        "grid_get_orders",
        "grid_get_order_details",
        "grid_get_sub_orders",
        "grid_create_order",
        "grid_stop_order",
    ],
    "bot.dca": [
        "dca_create_order",
        "dca_stop_order",
        "dca_get_orders",
        "dca_get_order_details",
        "dca_get_sub_orders",
    ],
    "news": [
        "news_get_latest",
        "news_get_by_coin",
        "news_search",
        "news_get_article",
        "news_get_sources",
        "news_get_coin_sentiment",
        "news_get_sentiment_trend",
    ],
    "smartmoney": [
        "smartmoney_get_leaderboard",
        "smartmoney_get_trader_performance",
        "smartmoney_get_trader_positions",
        "smartmoney_get_trader_position_history",
        "smartmoney_get_trader_order_history",
        "smartmoney_get_top_coin_signals",
        "smartmoney_get_coin_signal",
        "smartmoney_get_signal_by_traders",
        "smartmoney_get_signal_history_by_coin",
        "smartmoney_get_signal_history_by_traders",
    ],
}


def prefixed_tool_names(modules: str | None = None) -> list[str]:
    """Return `mcp__okx__<tool>` names for `ClaudeAgentOptions.allowed_tools`."""
    mods = (modules or DEFAULT_MODULES).split(",")
    out: list[str] = []
    for m in mods:
        for t in ATK_TOOLS_BY_MODULE.get(m.strip(), []):
            out.append(f"mcp__{MCP_SERVER_NAME}__{t}")
    return out


# --- Write-tool categorization (drives risk_hook dispatch) ---

# Tools that PLACE / AMEND a directional position. Gate: RiskManager + size cap.
ATK_PLACE_TOOLS: Final[set[str]] = {
    "spot_place_order",
    "spot_batch_place_orders",
    "spot_amend_order",
    "spot_place_algo_order",
    "swap_place_order",
    "swap_batch_place_orders",
    "swap_amend_order",
    "swap_place_algo_order",
    "swap_amend_algo_order",
    "swap_close_position",
    "move_order_stop",
    "grid_create_order",
    "dca_create_order",
}

# Cancels (allowed but logged — detects mass-cancel attacks during drawdown).
ATK_CANCEL_TOOLS: Final[set[str]] = {
    "spot_cancel_order",
    "spot_batch_cancel_orders",
    "spot_cancel_algo_order",
    "swap_cancel_order",
    "swap_batch_cancel_orders",
    "swap_cancel_algo_order",
    "grid_stop_order",
    "dca_stop_order",
}

# Transfer-shape (ccy/amt/from/to). Gate: per-call USD cap + ccy allowlist.
ATK_TRANSFER_TOOLS: Final[set[str]] = {"account_transfer"}

# Leverage-shape. Gate: max-leverage cap from AppSettings.max_leverage.
ATK_LEVERAGE_TOOLS: Final[set[str]] = {
    "swap_set_leverage",
    "account_set_leverage",
}

# Aggregated — what HookMatcher needs to know requires a gate.
ATK_WRITE_TOOLS: Final[set[str]] = (
    ATK_PLACE_TOOLS | ATK_CANCEL_TOOLS | ATK_TRANSFER_TOOLS | ATK_LEVERAGE_TOOLS
)

# Size-key aliases recognized by the place gate. Enforced as an allowlist —
# a place tool whose args contain NO matching key is DENIED (fail-closed).
SIZE_ALIASES: Final[tuple[str, ...]] = (
    "sz",
    "quoteSz",
    "baseSz",
    "initOrdAmt",
    "notionalUsd",
    "newSz",
    "tgtCcy",
    "investAmt",
)
