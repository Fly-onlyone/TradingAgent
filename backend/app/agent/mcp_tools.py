"""MCP tool wrappers for the Claude Agent SDK.

Wraps existing tool functions as in-process MCP tools using the @tool decorator.
Each wrapper delegates to the original tool function in app.agent.tools.
"""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

# ============================================================
# Chart Data Buffer
# ============================================================
# Stores the last candlestick result so the trading agent can
# emit it as a chart_data event to the frontend.
_last_chart_data: dict[str, Any] | None = None


def pop_pending_chart_data() -> dict[str, Any] | None:
    """Retrieve and clear the buffered chart data from a get_candlesticks call."""
    global _last_chart_data  # noqa: PLW0603
    data = _last_chart_data
    _last_chart_data = None
    return data


# ============================================================
# Active User Context
# ============================================================
# Set by the WebSocket handler so MCP tools can access the current user.
_active_user_id: ContextVar[str | None] = ContextVar("active_user_id", default=None)


def set_active_user_id(user_id: str) -> None:
    _active_user_id.set(user_id)


def get_active_user_id() -> str | None:
    return _active_user_id.get()


# ============================================================
# Tool Result Buffer & Logging
# ============================================================
# Captures tool results and timing so the trading agent can
# forward them to the frontend and persist in session history.
_tool_results: dict[str, dict[str, Any]] = {}
_tool_logger = logging.getLogger("agent.tool")


def pop_tool_result(tool_name: str) -> dict[str, Any] | None:
    """Retrieve and clear the buffered result for a tool call."""
    return _tool_results.pop(tool_name, None)


# ============================================================
# Ask User (Interactive Questions via WebSocket)
# ============================================================
# Allows the agent to ask the user a question with options and
# wait for their response, forwarded through the WebSocket.
_ws_event_emitter: Callable | None = None
_pending_questions: dict[str, asyncio.Future[str]] = {}

_ask_user_logger = logging.getLogger("agent.ask_user")


def set_ws_event_emitter(emitter: Callable) -> None:
    """Set the WebSocket event callback (called by the WS handler before chat)."""
    global _ws_event_emitter  # noqa: PLW0603
    _ws_event_emitter = emitter


def clear_ws_event_emitter() -> None:
    """Remove the WebSocket event callback (called on WS disconnect)."""
    global _ws_event_emitter  # noqa: PLW0603
    _ws_event_emitter = None


def resolve_user_answer(question_id: str, answer: str) -> bool:
    """Resolve a pending question with the user's answer. Returns True if resolved."""
    future = _pending_questions.get(question_id)
    if future and not future.done():
        future.set_result(answer)
        _ask_user_logger.info("User answered question %s", question_id)
        return True
    _ask_user_logger.warning("No pending question for id %s", question_id)
    return False


def cancel_pending_questions() -> None:
    """Cancel all pending user questions (called on disconnect or agent cancel)."""
    for qid, future in list(_pending_questions.items()):
        if not future.done():
            future.cancel()
    _pending_questions.clear()


def _summarize_result(tool_name: str, parsed: Any) -> str:
    """Create a human-readable summary of a tool result, truncated for display."""
    if isinstance(parsed, dict):
        if "error" in parsed:
            return f"Error: {str(parsed['error'])[:200]}"

        # Ticker
        if "last" in parsed or "lastPx" in parsed:
            price = parsed.get("last") or parsed.get("lastPx", "?")
            change = parsed.get("change24h") or parsed.get("change", "")
            symbol = parsed.get("symbol", "")
            parts = [symbol, f"${price}"] if symbol else [f"${price}"]
            if change:
                parts.append(f"{change}%")
            return ", ".join(parts)

        # Candlesticks
        if "candles" in parsed:
            count = len(parsed["candles"])
            symbol = parsed.get("symbol", "")
            tf = parsed.get("timeframe", "")
            return f"{count} candles{f' for {symbol}' if symbol else ''}{f' ({tf})' if tf else ''}"

        # Technical indicators
        if "rsi" in parsed or "macd" in parsed or "indicators" in parsed:
            parts = []
            if "rsi" in parsed:
                parts.append(
                    f"RSI {parsed['rsi']:.1f}"
                    if isinstance(parsed["rsi"], float)
                    else f"RSI {parsed['rsi']}"
                )
            if "macd" in parsed:
                macd = parsed["macd"]
                if isinstance(macd, dict):
                    parts.append(f"MACD {macd.get('signal', macd.get('histogram', ''))}")
                else:
                    parts.append(f"MACD {macd}")
            if "indicators" in parsed:
                names = list(parsed["indicators"].keys())[:4]
                parts.append(f"Indicators: {', '.join(names)}")
            return "; ".join(parts) if parts else "Technical data"

        # News / articles
        if "articles" in parsed:
            return f"{len(parsed['articles'])} articles"

        # Search results
        if "results" in parsed:
            return f"{len(parsed['results'])} results"

        # Balance
        if "balance" in parsed or "available" in parsed or "totalEq" in parsed:
            val = parsed.get("totalEq") or parsed.get("available") or parsed.get("balance", "N/A")
            return f"Balance: ${val}"

        # Orders / positions
        if "orders" in parsed:
            return f"{len(parsed['orders'])} orders"
        if "positions" in parsed:
            return f"{len(parsed['positions'])} positions"

        # Patterns
        if "patterns" in parsed:
            return f"{len(parsed['patterns'])} patterns detected"

        # Sentiment
        if "sentiment" in parsed or "overall_sentiment" in parsed:
            score = parsed.get("overall_sentiment") or parsed.get("sentiment", "N/A")
            return f"Sentiment: {score}"

        # Status / message response
        if "status" in parsed and "message" in parsed:
            return str(parsed["message"])[:200]

        # Strategies list
        if isinstance(parsed, dict) and any(k in parsed for k in ("name", "strategies")):
            if "strategies" in parsed:
                return f"{len(parsed['strategies'])} strategies"
            return parsed.get("name", "")[:100]

        # Fallback: show top-level keys
        keys = list(parsed.keys())[:6]
        return f"Keys: {', '.join(keys)}"

    if isinstance(parsed, list):
        if len(parsed) > 0 and isinstance(parsed[0], dict):
            # List of strategies or similar
            first_name = parsed[0].get("name", "")
            return f"{len(parsed)} items" + (f" (first: {first_name})" if first_name else "")
        return f"{len(parsed)} items"

    return str(parsed)[:200]


def _parse_mcp_response(response: dict[str, Any]) -> Any:
    """Extract parsed data from MCP tool response envelope."""
    if "content" in response:
        text = response["content"][0]["text"] if response.get("content") else "{}"
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
    return response


def _buffer_tool_result(
    tool_name: str,
    args: dict[str, Any],
    response: dict[str, Any],
    start_time: float,
) -> None:
    """Store a tool result with timing and log it."""
    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    parsed = _parse_mcp_response(response)
    summary = _summarize_result(tool_name, parsed)
    has_error = isinstance(parsed, dict) and "error" in parsed

    _tool_results[tool_name] = {
        "result_summary": summary,
        "execution_time_ms": elapsed_ms,
    }

    _tool_logger.info(
        "Tool %s completed in %dms%s — %s",
        tool_name,
        elapsed_ms,
        " [ERROR]" if has_error else "",
        summary,
        extra={
            "tool_name": tool_name,
            "arguments": _truncate_args(args),
            "result_summary": summary,
            "execution_time_ms": elapsed_ms,
            "has_error": has_error,
        },
    )


def _truncate_args(args: dict[str, Any]) -> dict[str, Any]:
    """Truncate large argument values for logging."""
    truncated = {}
    for k, v in args.items():
        if isinstance(v, str) and len(v) > 200:
            truncated[k] = v[:200] + "..."
        elif isinstance(v, list) and len(v) > 10:
            truncated[k] = v[:10]
        else:
            truncated[k] = v
    return truncated


# ============================================================
# Market Tools
# ============================================================


@tool(
    "get_ticker",
    "Get current ticker/price data for a trading symbol",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_get_ticker(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.market_tools import get_ticker

        result = await get_ticker(symbol=args["symbol"])
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_ticker", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_ticker", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.market_tools import get_orderbook

        result = await get_orderbook(symbol=args["symbol"], depth=args.get("depth", 20))
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_orderbook", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_orderbook", args, response, start)
        return response


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
    global _last_chart_data  # noqa: PLW0603
    start = time.monotonic()
    try:
        from app.agent.tools.market_tools import get_candlesticks

        result = await get_candlesticks(
            symbol=args["symbol"],
            timeframe=args.get("timeframe", "1H"),
            limit=args.get("limit", 100),
        )
        # Buffer chart data for the trading agent to emit to the frontend
        if "candles" in result:
            _last_chart_data = {
                "symbol": result.get("symbol", args["symbol"]),
                "timeframe": result.get("timeframe", args.get("timeframe", "1H")),
                "candles": [
                    {
                        "time": c["timestamp"],
                        "open": c["open"],
                        "high": c["high"],
                        "low": c["low"],
                        "close": c["close"],
                    }
                    for c in result["candles"]
                ],
            }
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_candlesticks", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_candlesticks", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.technical_tools import get_technical_indicators

        result = await get_technical_indicators(
            symbol=args["symbol"],
            timeframe=args.get("timeframe", "1H"),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_technical_indicators", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_technical_indicators", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.technical_tools import detect_chart_patterns

        result = await detect_chart_patterns(
            symbol=args["symbol"],
            timeframe=args.get("timeframe", "4H"),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("detect_chart_patterns", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("detect_chart_patterns", args, response, start)
        return response


# ============================================================
# Fundamental Analysis Tools
# ============================================================


@tool(
    "get_onchain_metrics",
    "Get on-chain metrics for crypto assets (exchange flows, whale activity, etc.)",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Crypto asset symbol (e.g., BTC, ETH, BTC-USDT)",
            },
        },
        "required": ["symbol"],
    },
)
async def mcp_get_onchain_metrics(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.fundamental_tools import get_onchain_metrics

        result = await get_onchain_metrics(symbol=args["symbol"])
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_onchain_metrics", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_onchain_metrics", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.fundamental_tools import get_macro_indicators

        result = await get_macro_indicators()
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_macro_indicators", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_macro_indicators", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.news_tools import get_latest_news

        result = await get_latest_news(
            assets=args.get("assets"),
            limit=args.get("limit", 10),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("get_latest_news", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_latest_news", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.news_tools import get_news_sentiment

        result = await get_news_sentiment(
            assets=args.get("assets"),
            hours=args.get("hours", 24),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("get_news_sentiment", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_news_sentiment", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.knowledge_tools import search_strategies

        result = await search_strategies(
            query=args["query"],
            limit=args.get("limit", 5),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("search_strategies", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("search_strategies", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.knowledge_tools import search_lessons

        result = await search_lessons(
            query=args["query"],
            symbol=args.get("symbol"),
            limit=args.get("limit", 5),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("search_lessons", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("search_lessons", args, response, start)
        return response


@tool(
    "search_patterns",
    "Search discovered trading patterns (technical, sentiment, correlation) by query",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query for pattern search",
            },
            "pattern_type": {
                "type": "string",
                "description": "Filter by pattern type (technical, sentiment, correlation)",
            },
            "min_success_rate": {
                "type": "number",
                "description": "Minimum success rate threshold (0-100)",
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
async def mcp_search_patterns(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.knowledge_tools import search_patterns

        result = await search_patterns(
            query=args["query"],
            pattern_type=args.get("pattern_type"),
            min_success_rate=args.get("min_success_rate"),
            limit=args.get("limit", 5),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("search_patterns", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("search_patterns", args, response, start)
        return response


# ============================================================
# User Strategy Tools
# ============================================================


@tool(
    "list_user_strategies",
    "List the user's trading strategies from the Strategies page. Use this to review "
    "strategies, check which are active/inactive, or find strategies that match current "
    "market conditions. Call this proactively during market analysis to suggest activating "
    "relevant inactive strategies.",
    {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["all", "active", "inactive"],
                "description": "Filter by strategy status",
                "default": "all",
            },
        },
    },
)
async def mcp_list_user_strategies(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from beanie import PydanticObjectId

        from app.db.models.strategy import Strategy

        user_id = get_active_user_id()
        if not user_id:
            response = {
                "content": [{"type": "text", "text": json.dumps({"error": "No active user"})}]
            }
            _buffer_tool_result("list_user_strategies", args, response, start)
            return response

        query = Strategy.find(Strategy.user_id == PydanticObjectId(user_id))
        status = args.get("status", "all")
        if status == "active":
            query = query.find(Strategy.is_active == True)  # noqa: E712
        elif status == "inactive":
            query = query.find(Strategy.is_active == False)  # noqa: E712

        strategies = await query.to_list()
        result = [
            {
                "id": str(s.id),
                "name": s.name,
                "description": s.description,
                "is_active": s.is_active,
                "symbols": s.symbols,
                "timeframes": s.timeframes,
                "entry_rules": s.entry_rules,
                "exit_rules": s.exit_rules,
                "risk_params": s.risk_params,
                "auto_discovered": s.auto_discovered,
                "source_url": s.source_url,
            }
            for s in strategies
        ]
        response = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
        _buffer_tool_result("list_user_strategies", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("list_user_strategies", args, response, start)
        return response


@tool(
    "toggle_strategy",
    "Activate or deactivate a trading strategy. ALWAYS ask the user for confirmation "
    "before calling this tool. Explain which strategy you want to toggle and why.",
    {
        "type": "object",
        "properties": {
            "strategy_id": {
                "type": "string",
                "description": "The strategy ID to toggle",
            },
            "activate": {
                "type": "boolean",
                "description": "True to activate, False to deactivate",
            },
        },
        "required": ["strategy_id", "activate"],
    },
)
async def mcp_toggle_strategy(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from beanie import PydanticObjectId

        from app.db.models.strategy import Strategy

        user_id = get_active_user_id()
        if not user_id:
            response = {
                "content": [{"type": "text", "text": json.dumps({"error": "No active user"})}]
            }
            _buffer_tool_result("toggle_strategy", args, response, start)
            return response

        strategy = await Strategy.get(PydanticObjectId(args["strategy_id"]))
        if not strategy or str(strategy.user_id) != user_id:
            response = {
                "content": [{"type": "text", "text": json.dumps({"error": "Strategy not found"})}]
            }
            _buffer_tool_result("toggle_strategy", args, response, start)
            return response

        strategy.is_active = args["activate"]
        strategy.update_timestamp()
        await strategy.save()

        action = "activated" if args["activate"] else "deactivated"
        response = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "status": "success",
                            "message": f"Strategy '{strategy.name}' has been {action}",
                        }
                    ),
                }
            ]
        }
        _buffer_tool_result("toggle_strategy", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("toggle_strategy", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.trading_tools import get_account_balance

        result = await get_account_balance()
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_account_balance", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_account_balance", args, response, start)
        return response


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
    start = time.monotonic()
    try:
        from app.agent.tools.trading_tools import get_open_orders

        result = await get_open_orders(symbol=args.get("symbol"))
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("get_open_orders", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("get_open_orders", args, response, start)
        return response


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
    start = time.monotonic()
    try:
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
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("place_order", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("place_order", args, response, start)
        return response


@tool(
    "cancel_order",
    "Cancel an open order",
    {
        "type": "object",
        "properties": {
            "symbol": {
                "type": "string",
                "description": "Trading pair symbol (e.g., BTC-USDT)",
            },
            "order_id": {
                "type": "string",
                "description": "Order ID to cancel",
            },
        },
        "required": ["symbol", "order_id"],
    },
)
async def mcp_cancel_order(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.trading_tools import cancel_order

        result = await cancel_order(symbol=args["symbol"], order_id=args["order_id"])
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("cancel_order", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("cancel_order", args, response, start)
        return response


# ============================================================
# Structured Recommendation Output
# ============================================================

# Module-level store for structured recommendations keyed by request ID.
# The trading agent sets a request ID before calling chat(), and the
# submit_recommendation tool writes the structured data here.
_pending_recommendations: dict[str, dict[str, Any]] = {}


@tool(
    "submit_recommendation",
    "Submit your final trading recommendation. You MUST call this tool at the end of every analysis with your structured recommendation.",
    {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["buy", "sell", "hold", "wait"],
                "description": "Recommended action",
            },
            "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 100,
                "description": "Confidence level (0-100%)",
            },
            "entry_price": {
                "type": "number",
                "description": "Suggested entry price",
            },
            "stop_loss": {
                "type": "number",
                "description": "Suggested stop loss price",
            },
            "take_profit": {
                "type": "number",
                "description": "Suggested take profit price",
            },
            "position_size": {
                "type": "number",
                "description": "Suggested position size in base currency",
            },
            "summary": {
                "type": "string",
                "description": "1-2 sentence summary of the recommendation",
            },
            "key_factors": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Key factors driving this recommendation",
            },
        },
        "required": ["action", "confidence", "summary"],
    },
)
async def mcp_submit_recommendation(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        request_id = args.pop("_request_id", None)
        if request_id:
            _pending_recommendations[request_id] = args
        else:
            _pending_recommendations["__latest__"] = args

        response = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps({"status": "ok", "message": "Recommendation recorded."}),
                }
            ]
        }
        _buffer_tool_result("submit_recommendation", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("submit_recommendation", args, response, start)
        return response


def get_pending_recommendation(request_id: str) -> dict[str, Any] | None:
    """Retrieve and remove a pending recommendation by request ID."""
    return _pending_recommendations.pop(
        request_id, _pending_recommendations.pop("__latest__", None)
    )


# ============================================================
# Task Self-Modification
# ============================================================

_task_execution_context: dict[str, dict[str, Any]] = {}
_active_task_request_id: ContextVar[str | None] = ContextVar("active_task_request_id", default=None)


def set_task_execution_context(request_id: str, task_id: str, user_id: str, mode: str) -> None:
    """Register execution context so the modify_task tool can access the current task."""
    _task_execution_context[request_id] = {
        "task_id": task_id,
        "user_id": user_id,
        "mode": mode,
    }
    _active_task_request_id.set(request_id)


def clear_task_execution_context(request_id: str) -> None:
    """Remove execution context after task execution completes."""
    _task_execution_context.pop(request_id, None)
    if _active_task_request_id.get() == request_id:
        _active_task_request_id.set(None)


def _get_task_context() -> dict[str, Any] | None:
    request_id = _active_task_request_id.get()
    if not request_id:
        return None
    return _task_execution_context.get(request_id)


def _serialize_task_value(value: Any) -> Any:
    """Convert task field values into JSON-serializable data."""
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize_task_value(item) for item in value]
    if hasattr(value, "value"):
        return value.value
    return value


def _text_result(data: dict[str, Any]) -> dict[str, Any]:
    """Wrap a dict as an MCP tool text result."""
    return {"content": [{"type": "text", "text": json.dumps(data)}]}


@tool(
    "modify_task",
    "Propose or apply modifications to the current task's configuration. "
    "Use when market conditions warrant changes to risk level, symbols, "
    "position sizing, schedule, or monitoring conditions.",
    {
        "type": "object",
        "properties": {
            "changes": {
                "type": "object",
                "description": (
                    "Object with field names as keys and new values. "
                    "Allowed fields: symbols, risk_level, max_position_size, "
                    "max_daily_trades, monitoring_conditions, alert_cooldown_minutes, "
                    "custom_instructions, schedules, use_subagents"
                ),
            },
            "reason": {
                "type": "string",
                "description": "Explanation for why these changes are needed",
            },
        },
        "required": ["changes", "reason"],
    },
)
async def mcp_modify_task(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        import logging

        from app.db.models.agent_task import (
            AGENT_MODIFIABLE_FIELDS,
            AgentTask,
            RiskLevel,
            coerce_task_changes,
        )

        _logger = logging.getLogger(__name__)
        changes: dict[str, Any] = args.get("changes", {})
        reason: str = args.get("reason", "")

        ctx = _get_task_context()
        if not ctx:
            return _text_result({"status": "error", "message": "No active task context."})

        invalid_fields = set(changes.keys()) - AGENT_MODIFIABLE_FIELDS
        if invalid_fields:
            return _text_result(
                {
                    "status": "error",
                    "message": f"Cannot modify: {', '.join(sorted(invalid_fields))}. "
                    f"Allowed: {', '.join(sorted(AGENT_MODIFIABLE_FIELDS))}",
                }
            )

        if not changes:
            return _text_result({"status": "error", "message": "No changes provided."})

        if "risk_level" in changes:
            try:
                RiskLevel(changes["risk_level"])
            except ValueError:
                return _text_result(
                    {
                        "status": "error",
                        "message": f"Invalid risk_level: {changes['risk_level']}. "
                        "Must be conservative, moderate, or aggressive.",
                    }
                )

        try:
            coerced_changes = coerce_task_changes(changes)
        except (TypeError, ValueError) as exc:
            return _text_result({"status": "error", "message": str(exc)})

        from beanie import PydanticObjectId

        task = await AgentTask.get(PydanticObjectId(ctx["task_id"]))
        if not task:
            return _text_result({"status": "error", "message": "Task not found."})

        # Build before/after diff
        before: dict[str, Any] = {}
        after: dict[str, Any] = {}
        for field_name, new_value in changes.items():
            current_value = getattr(task, field_name, None)
            before[field_name] = _serialize_task_value(current_value)
            after[field_name] = _serialize_task_value(coerced_changes[field_name])

        mode = ctx["mode"]

        if mode == "auto":
            for field_name, new_value in coerced_changes.items():
                setattr(task, field_name, new_value)
            task.update_timestamp()
            await task.save()

            if "schedules" in changes:
                try:
                    from app.agent.task_scheduler import get_scheduler

                    scheduler = get_scheduler()
                    await scheduler.schedule_task(task)
                except Exception:
                    _logger.warning("Failed to reschedule after modification", exc_info=True)

            _logger.info("Task %s auto-modified: %s", ctx["task_id"], list(changes.keys()))
            return _text_result(
                {
                    "status": "ok",
                    "message": f"Task modified (auto). Changed: {', '.join(changes.keys())}.",
                    "applied": True,
                }
            )

        if mode == "ask":
            from datetime import UTC, datetime, timedelta

            from app.db.models.agent_decision import (
                AgentDecision,
                DecisionStatus,
                DecisionType,
            )
            from app.db.models.notification import Notification, NotificationType

            decision = AgentDecision(
                user_id=PydanticObjectId(ctx["user_id"]),
                task_id=PydanticObjectId(ctx["task_id"]),
                decision_type=DecisionType.TASK_MODIFICATION,
                status=DecisionStatus.PENDING,
                summary=f"Agent proposes task changes: {', '.join(changes.keys())}",
                reasoning=reason,
                key_factors=list(changes.keys()),
                proposed_changes={"before": before, "after": after, "reason": reason},
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
            await decision.insert()

            notification = Notification(
                user_id=PydanticObjectId(ctx["user_id"]),
                notification_type=NotificationType.TASK_MODIFICATION_PROPOSED,
                title="Agent proposes task changes",
                message=f"Modify: {', '.join(changes.keys())}. Reason: {reason}",
                related_task_id=PydanticObjectId(ctx["task_id"]),
                related_decision_id=decision.id,
            )
            await notification.insert()

            _logger.info(
                "Task %s modification proposed: %s",
                ctx["task_id"],
                list(changes.keys()),
            )
            return _text_result(
                {
                    "status": "ok",
                    "message": f"Awaiting user approval. Fields: {', '.join(changes.keys())}.",
                    "applied": False,
                    "decision_id": str(decision.id),
                }
            )

        response = _text_result({"status": "error", "message": f"Unknown mode: {mode}"})
        _buffer_tool_result("modify_task", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("modify_task", args, response, start)
        return response


# ============================================================
# Web Search Tools (Brave Search API)
# ============================================================


@tool(
    "search_web",
    "Search the web for real-time information. Use for regulatory updates, analyst opinions, project news, or any current information not in the database.",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query (max 400 chars)",
            },
            "count": {
                "type": "integer",
                "description": "Number of results (1-20, default 5)",
                "default": 5,
            },
            "freshness": {
                "type": "string",
                "enum": ["pd", "pw", "pm"],
                "description": "pd=past day, pw=past week, pm=past month",
            },
        },
        "required": ["query"],
    },
)
async def mcp_search_web(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.web_search_tools import search_web

        result = await search_web(
            query=args["query"],
            count=args.get("count", 5),
            freshness=args.get("freshness"),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("search_web", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("search_web", args, response, start)
        return response


@tool(
    "search_news",
    "Search for recent news articles. Optimized for breaking news and recent developments about crypto assets, regulations, and markets.",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "News search query",
            },
            "count": {
                "type": "integer",
                "description": "Number of results (1-20, default 5)",
                "default": 5,
            },
            "freshness": {
                "type": "string",
                "enum": ["pd", "pw", "pm"],
                "description": "pd=past day, pw=past week, pm=past month",
            },
        },
        "required": ["query"],
    },
)
async def mcp_search_news(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    try:
        from app.agent.tools.web_search_tools import search_news

        result = await search_news(
            query=args["query"],
            count=args.get("count", 5),
            freshness=args.get("freshness"),
        )
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("search_news", args, response, start)
        return response
    except Exception as e:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]}
        _buffer_tool_result("search_news", args, response, start)
        return response


# ============================================================
# Ask User Tool
# ============================================================


@tool(
    "ask_user",
    "Ask the user a question and wait for their response. "
    "Use this to get clarification, preferences, or decisions from the user. "
    "Provide options for multiple-choice questions, or omit for free-form input.",
    {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The question to ask the user",
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of choices for the user to pick from",
            },
        },
        "required": ["question"],
    },
)
async def mcp_ask_user(args: dict[str, Any]) -> dict[str, Any]:
    """Ask the user a question and wait for their response."""
    question = args["question"]
    options = args.get("options")
    start = time.monotonic()
    question_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future: asyncio.Future[str] = loop.create_future()
    _pending_questions[question_id] = future

    emitter = _ws_event_emitter
    if emitter:
        await emitter(
            {
                "type": "ask_user",
                "data": {
                    "id": question_id,
                    "question": question,
                    "options": options or [],
                },
            }
        )
        _ask_user_logger.info("Sent question %s to user: %s", question_id, question)
    else:
        _ask_user_logger.warning("No WS emitter — cannot deliver question to user")
        _pending_questions.pop(question_id, None)
        response = {
            "content": [
                {"type": "text", "text": json.dumps({"error": "No active WebSocket connection"})}
            ]
        }
        _buffer_tool_result("ask_user", {"question": question}, response, start)
        return response

    try:
        answer = await asyncio.wait_for(future, timeout=300)
        result = {"answer": answer}
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("ask_user", {"question": question}, response, start)
        return response
    except TimeoutError:
        result = {"error": "User did not respond within 5 minutes"}
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("ask_user", {"question": question}, response, start)
        return response
    except asyncio.CancelledError:
        result = {"error": "Question was cancelled"}
        response = {"content": [{"type": "text", "text": json.dumps(result)}]}
        _buffer_tool_result("ask_user", {"question": question}, response, start)
        return response
    finally:
        _pending_questions.pop(question_id, None)


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
    # Web search
    mcp_search_web,
    mcp_search_news,
    # Knowledge
    mcp_search_strategies,
    mcp_search_lessons,
    mcp_search_patterns,
    # Trading
    mcp_get_account_balance,
    mcp_get_open_orders,
    mcp_place_order,
    mcp_cancel_order,
    # Task self-modification
    mcp_modify_task,
    # Structured output
    mcp_submit_recommendation,
    # Interactive
    mcp_ask_user,
]

ALLOWED_TOOL_NAMES = [f"mcp__trading__{t.name}" for t in ALL_TRADING_TOOLS]


def create_trading_mcp_server():
    """Create an in-process MCP server with all trading tools."""
    return create_sdk_mcp_server(
        name="trading",
        version="1.0.0",
        tools=ALL_TRADING_TOOLS,
    )
