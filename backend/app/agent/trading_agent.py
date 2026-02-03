"""Main Trading Agent using Claude API with tool use."""

import json
import logging
from typing import Any, Callable, Optional

from anthropic import Anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# Tool definitions for Claude
TRADING_TOOLS = [
    {
        "name": "get_ticker",
        "description": "Get current ticker/price data for a trading symbol",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Trading pair symbol (e.g., BTC-USDT)",
                }
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_orderbook",
        "description": "Get order book (bids/asks) for a trading symbol",
        "input_schema": {
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
    },
    {
        "name": "get_candlesticks",
        "description": "Get OHLCV candlestick data for technical analysis",
        "input_schema": {
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
    },
    {
        "name": "get_technical_indicators",
        "description": "Calculate technical indicators (RSI, MACD, Bollinger Bands, etc.) for a symbol",
        "input_schema": {
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
    },
    {
        "name": "detect_chart_patterns",
        "description": "Detect chart patterns (head & shoulders, triangles, etc.)",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Trading pair symbol",
                },
                "timeframe": {
                    "type": "string",
                    "description": "Timeframe for pattern detection",
                    "default": "4H",
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_onchain_metrics",
        "description": "Get on-chain metrics for crypto assets (exchange flows, whale activity, etc.)",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Crypto asset symbol (e.g., BTC, ETH)",
                }
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_macro_indicators",
        "description": "Get macro economic indicators (BTC dominance, fear/greed index, etc.)",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_latest_news",
        "description": "Get latest news articles for specified assets",
        "input_schema": {
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
    },
    {
        "name": "get_news_sentiment",
        "description": "Get aggregated news sentiment for specified assets",
        "input_schema": {
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
    },
    {
        "name": "search_strategies",
        "description": "Search knowledge base for trading strategies matching a query",
        "input_schema": {
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
    },
    {
        "name": "search_lessons",
        "description": "Search past trade lessons for relevant insights",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language query for lesson search",
                },
                "symbol": {
                    "type": "string",
                    "description": "Filter by trading symbol",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of results to return",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_account_balance",
        "description": "Get current account balance and available funds",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_open_orders",
        "description": "Get list of open orders",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Filter by trading symbol (optional)",
                }
            },
            "required": [],
        },
    },
    {
        "name": "place_order",
        "description": "Place a trading order on the exchange",
        "input_schema": {
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
                "quantity": {
                    "type": "number",
                    "description": "Order quantity",
                },
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
    },
    {
        "name": "cancel_order",
        "description": "Cancel an open order",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Trading pair symbol",
                },
                "order_id": {
                    "type": "string",
                    "description": "Order ID to cancel",
                },
            },
            "required": ["symbol", "order_id"],
        },
    },
]

SYSTEM_PROMPT = """You are an expert autonomous trading agent for cryptocurrency markets. Your role is to analyze market conditions and make informed trading decisions.

## Your Capabilities:
1. **Technical Analysis**: Analyze price charts, indicators (RSI, MACD, Bollinger Bands), and patterns
2. **Fundamental Analysis**: Evaluate on-chain metrics, project fundamentals, and macro conditions
3. **News Analysis**: Assess market sentiment from news and social media
4. **Risk Management**: Calculate position sizes and set appropriate stop-losses
5. **Order Execution**: Place and manage trading orders

## Decision Framework:
When asked to analyze or trade, follow this process:

1. **Gather Data**: Use tools to collect market data, indicators, and news
2. **Technical Analysis**: Evaluate trend, momentum, and key levels
3. **Fundamental Analysis**: Check on-chain metrics and macro conditions
4. **Sentiment Analysis**: Review recent news and market sentiment
5. **Risk Assessment**: Determine appropriate position size and risk parameters
6. **Decision**: Provide clear recommendation with reasoning

## Risk Rules:
- Never risk more than 2% of portfolio on a single trade
- Always use stop-losses
- Consider market volatility when sizing positions
- Factor in source credibility when analyzing news

## Response Format:
Always provide clear, structured analysis with:
- Current market conditions summary
- Key technical levels (support/resistance)
- Sentiment assessment
- Risk/reward evaluation
- Specific recommendation with confidence level (0-100%)

Be concise but thorough. Explain your reasoning clearly."""


class TradingAgent:
    """Trading Agent using Claude API with tool use capabilities."""

    def __init__(
        self,
        tool_handlers: Optional[dict[str, Callable]] = None,
    ):
        """Initialize the trading agent.

        Args:
            tool_handlers: Dictionary mapping tool names to handler functions
        """
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.tool_handlers = tool_handlers or {}
        self.conversation_history: list[dict] = []

    def register_tool(self, name: str, handler: Callable) -> None:
        """Register a tool handler function."""
        self.tool_handlers[name] = handler

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> Any:
        """Execute a tool and return the result."""
        if tool_name not in self.tool_handlers:
            return {"error": f"Tool '{tool_name}' not found"}

        handler = self.tool_handlers[tool_name]
        try:
            # Handle both sync and async handlers
            import asyncio

            if asyncio.iscoroutinefunction(handler):
                result = await handler(**tool_input)
            else:
                result = handler(**tool_input)
            return result
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            return {"error": str(e)}

    async def chat(
        self,
        user_message: str,
        max_iterations: int = 10,
    ) -> str:
        """Process a user message and return the agent's response.

        Args:
            user_message: The user's input message
            max_iterations: Maximum tool use iterations to prevent infinite loops

        Returns:
            The agent's final text response
        """
        # Add user message to history
        self.conversation_history.append(
            {
                "role": "user",
                "content": user_message,
            }
        )

        iterations = 0
        while iterations < max_iterations:
            iterations += 1

            # Call Claude API
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TRADING_TOOLS,
                messages=self.conversation_history,
            )

            # Check if we need to use tools
            if response.stop_reason == "tool_use":
                # Process tool calls
                tool_results = []
                assistant_content = response.content

                for block in response.content:
                    if block.type == "tool_use":
                        tool_name = block.name
                        tool_input = block.input

                        logger.info(
                            f"Executing tool: {tool_name} with input: {tool_input}"
                        )

                        # Execute the tool
                        result = await self._execute_tool(tool_name, tool_input)

                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": (
                                    json.dumps(result)
                                    if not isinstance(result, str)
                                    else result
                                ),
                            }
                        )

                # Add assistant message with tool use
                self.conversation_history.append(
                    {
                        "role": "assistant",
                        "content": assistant_content,
                    }
                )

                # Add tool results
                self.conversation_history.append(
                    {
                        "role": "user",
                        "content": tool_results,
                    }
                )

            else:
                # No more tool use, get final response
                final_response = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_response += block.text

                # Add assistant response to history
                self.conversation_history.append(
                    {
                        "role": "assistant",
                        "content": response.content,
                    }
                )

                return final_response

        return "Maximum iterations reached. Please try a simpler query."

    def clear_history(self) -> None:
        """Clear conversation history."""
        self.conversation_history = []

    async def analyze_market(self, symbol: str) -> str:
        """Convenience method to analyze a market."""
        return await self.chat(
            f"Analyze the current market conditions for {symbol}. "
            "Provide technical analysis, sentiment, and a trading recommendation."
        )

    async def should_trade(self, symbol: str, side: str) -> dict:
        """Ask the agent if a trade should be executed.

        Returns dict with 'should_trade', 'confidence', and 'reasoning'.
        """
        response = await self.chat(
            f"Should I {side} {symbol} right now? "
            "Analyze the market and provide a clear yes/no recommendation "
            "with confidence level (0-100%) and detailed reasoning."
        )

        # Parse response for structured data
        # This is a simplified parser - in production, use structured output
        should_trade = "yes" in response.lower()[:100]
        confidence = 50  # Default

        # Try to extract confidence from response
        import re

        confidence_match = re.search(r"(\d+)%", response)
        if confidence_match:
            confidence = int(confidence_match.group(1))

        return {
            "should_trade": should_trade,
            "confidence": confidence,
            "reasoning": response,
        }
