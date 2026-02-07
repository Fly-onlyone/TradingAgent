"""MCP tool wrappers for the Claude Agent SDK.

Wraps existing tool functions as in-process MCP tools using the @tool decorator.
Each wrapper delegates to the original tool function in app.agent.tools.
"""

import json
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

# ============================================================
# Market Tools
# ============================================================


@tool(
    "get_ticker", "Get current ticker/price data for a trading symbol", {"symbol": str}
)
async def mcp_get_ticker(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.market_tools import get_ticker

    result = await get_ticker(symbol=args["symbol"])
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "get_orderbook",
    "Get order book (bids/asks) for a trading symbol",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
            "depth": {
                "type": "integer",
                "description": "Number of levels to retrieve (default 20)",
                "default": 20,
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_get_orderbook(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.market_tools import get_orderbook

    result = await get_orderbook(symbol=args["symbol"], depth=args.get("depth", 20))
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "get_candlesticks",
    "Get OHLCV candlestick data for technical analysis",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
            "timeframe": {
                "type": "string",
                "description": "Candle timeframe (1m, 5m, 15m, 30m, 1H, 4H, 1D)",
                "default": "1H",
            },
            "limit": {
                "type": "integer",
                "description": "Number of candles to retrieve (default 100)",
                "default": 100,
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_get_candlesticks(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.market_tools import get_candlesticks

    result = await get_candlesticks(
        symbol=args["symbol"],
        timeframe=args.get("timeframe", "1H"),
        limit=args.get("limit", 100),
    )
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


# ============================================================
# Technical Analysis Tools
# ============================================================


@tool(
    "get_technical_indicators",
    "Calculate technical indicators (RSI, MACD, Bollinger Bands, etc.) for a symbol",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
            "timeframe": {
                "type": "string",
                "description": "Timeframe for analysis (1H, 4H, 1D)",
                "default": "1H",
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_get_technical_indicators(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.technical_tools import get_technical_indicators

    result = await get_technical_indicators(
        symbol=args["symbol"],
        timeframe=args.get("timeframe", "1H"),
    )
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "detect_chart_patterns",
    "Detect chart patterns (head & shoulders, triangles, etc.)",
    {
        "type": "object",
        "properties": {
            "symbol": {"type": "string", "description": "Trading pair symbol"},
            "timeframe": {
                "type": "string",
                "description": "Timeframe for pattern detection",
                "default": "4H",
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_detect_chart_patterns(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.technical_tools import detect_chart_patterns

    result = await detect_chart_patterns(
        symbol=args["symbol"],
        timeframe=args.get("timeframe", "4H"),
    )
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


# ============================================================
# Fundamental Analysis Tools
# ============================================================


@tool(
    "get_onchain_metrics",
    "Get on-chain metrics for crypto assets (exchange flows, whale activity, etc.)",
    {"symbol": str},
)
async def mcp_get_onchain_metrics(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.fundamental_tools import get_onchain_metrics

    result = await get_onchain_metrics(symbol=args["symbol"])
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "get_macro_indicators",
    "Get macro economic indicators (BTC dominance, fear/greed index, etc.)",
    {
        "type": "object",
        "properties": {},
        "required": [],
    },
)
async def mcp_get_macro_indicators(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.fundamental_tools import get_macro_indicators

    result = await get_macro_indicators()
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


# ============================================================
# News Tools
# ============================================================


@tool(
    "get_latest_news",
    "Get latest news articles for specified assets",
    {
        "type": "object",
        "properties": {
            "assets": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of asset symbols to get news for",
            },
            "limit": {
                "type": "integer",
                "description": "Number of articles to retrieve",
                "default": 10,
            },
        },
        "required": [],
    },
)
async def mcp_get_latest_news(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.news_tools import get_latest_news

    result = await get_latest_news(
        assets=args.get("assets"),
        limit=args.get("limit", 10),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}


@tool(
    "get_news_sentiment",
    "Get aggregated news sentiment for specified assets",
    {
        "type": "object",
        "properties": {
            "assets": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of asset symbols",
            },
            "hours": {
                "type": "integer",
                "description": "Time window in hours",
                "default": 24,
            },
        },
        "required": [],
    },
)
async def mcp_get_news_sentiment(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.news_tools import get_news_sentiment

    result = await get_news_sentiment(
        assets=args.get("assets"),
        hours=args.get("hours", 24),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}


# ============================================================
# Knowledge Tools
# ============================================================


@tool(
    "search_strategies",
    "Search knowledge base for trading strategies matching a query",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query for strategy search",
            },
            "limit": {
                "type": "integer",
                "description": "Number of results to return",
                "default": 5,
            },
        },
        "required": ["query"],
    },
)
async def mcp_search_strategies(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.knowledge_tools import search_strategies

    result = await search_strategies(
        query=args["query"],
        limit=args.get("limit", 5),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}


@tool(
    "search_lessons",
    "Search past trade lessons for relevant insights",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query for lesson search",
            },
            "symbol": {"type": "string", "description": "Filter by trading symbol"},
            "limit": {
                "type": "integer",
                "description": "Number of results to return",
                "default": 5,
            },
        },
        "required": ["query"],
    },
)
async def mcp_search_lessons(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.knowledge_tools import search_lessons

    result = await search_lessons(
        query=args["query"],
        symbol=args.get("symbol"),
        limit=args.get("limit", 5),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}


# ============================================================
# Trading Execution Tools
# ============================================================


@tool(
    "get_account_balance",
    "Get current account balance and available funds",
    {
        "type": "object",
        "properties": {},
        "required": [],
    },
)
async def mcp_get_account_balance(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.trading_tools import get_account_balance

    result = await get_account_balance()
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "get_open_orders",
    "Get list of open orders",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Filter by trading symbol (optional)",
            },
        },
        "required": [],
    },
)
async def mcp_get_open_orders(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.trading_tools import get_open_orders

    result = await get_open_orders(symbol=args.get("symbol"))
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "place_order",
    "Place a trading order on the exchange",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
            "side": {
                "type": "string",
                "enum": ["buy", "sell"],
                "description": "Order side",
            },
            "order_type": {
                "type": "string",
                "enum": ["market", "limit"],
                "description": "Order type",
            },
            "quantity": {"type": "number", "description": "Order quantity"},
            "price": {
                "type": "number",
                "description": "Limit price (required for limit orders)",
            },
            "stop_loss": {
                "type": "number",
                "description": "Stop loss price (optional)",
            },
            "take_profit": {
                "type": "number",
                "description": "Take profit price (optional)",
            },
        },
        "required": ["symbol", "side", "order_type", "quantity"],
    },
)
async def mcp_place_order(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.trading_tools import place_order

    result = await place_order(
        symbol=args["symbol"],
        side=args["side"],
        order_type=args["order_type"],
        quantity=args["quantity"],
        price=args.get("price"),
        stop_loss=args.get("stop_loss"),
        take_profit=args.get("take_profit"),
    )
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


@tool(
    "cancel_order",
    "Cancel an open order",
    {"symbol": str, "order_id": str},
)
async def mcp_cancel_order(args: dict[str, Any]) -> dict[str, Any]:
    from app.agent.tools.trading_tools import cancel_order

    result = await cancel_order(symbol=args["symbol"], order_id=args["order_id"])
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


# ============================================================
# MCP Server Factory
# ============================================================

ALL_TRADING_TOOLS = [
    # Market
    mcp_get_ticker,
    mcp_get_orderbook,
    mcp_get_candlesticks,
    # Technical
    mcp_get_technical_indicators,
    mcp_detect_chart_patterns,
    # Fundamental
    mcp_get_onchain_metrics,
    mcp_get_macro_indicators,
    # News
    mcp_get_latest_news,
    mcp_get_news_sentiment,
    # Knowledge
    mcp_search_strategies,
    mcp_search_lessons,
    # Trading
    mcp_get_account_balance,
    mcp_get_open_orders,
    mcp_place_order,
    mcp_cancel_order,
]

ALLOWED_TOOL_NAMES = [f"mcp__trading__{t.name}" for t in ALL_TRADING_TOOLS]


def create_trading_mcp_server():
    """Create an in-process MCP server with all trading tools."""
    return create_sdk_mcp_server(
        name="trading",
        version="1.0.0",
        tools=ALL_TRADING_TOOLS,
    )
