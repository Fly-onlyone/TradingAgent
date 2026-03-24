"""Main Trading Agent using Claude Agent SDK with MCP tools."""

import asyncio
import logging
import re
import uuid
from collections.abc import Callable
from typing import Any

import sentry_sdk
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
)

from app.agent.mcp_tools import (
    ALLOWED_TOOL_NAMES,
    create_trading_mcp_server,
    get_pending_recommendation,
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


SYSTEM_PROMPT = """You are an expert autonomous trading agent for cryptocurrency markets. Your role is to analyze market conditions and make informed trading decisions.

## Your Capabilities:
1. **Technical Analysis**: Analyze price charts, indicators (RSI, MACD, Bollinger Bands), and patterns
2. **Fundamental Analysis**: Evaluate on-chain metrics, project fundamentals, and macro conditions
3. **News Analysis**: Assess market sentiment from news and social media
4. **Risk Management**: Calculate position sizes and set appropriate stop-losses
5. **Order Execution**: Place and manage trading orders
6. **Web Search**: Search the web for real-time news, regulatory updates, and analyst opinions using search_web and search_news tools
7. **Knowledge Base**: Search past trading strategies, trade lessons from completed trades, and discovered trading patterns for historical context and to avoid repeating past mistakes

## Decision Framework:
When asked to analyze or trade, follow this process:

0. **Historical Context**: Search the knowledge base for relevant past strategies, trade lessons, and patterns related to the current symbol or market conditions
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
- Check past trade lessons for the same symbol before entering a position

## Response Format:
Always provide clear, structured analysis with:
- Current market conditions summary
- Key technical levels (support/resistance)
- Sentiment assessment
- Risk/reward evaluation
- Specific recommendation with confidence level (0-100%)

Be concise but thorough. Explain your reasoning clearly.

## IMPORTANT - Structured Output:
After completing your analysis, you MUST call the `submit_recommendation` tool with your structured recommendation. This tool accepts: action (buy/sell/hold/wait), confidence (0-100), summary, and optional entry_price, stop_loss, take_profit, position_size, key_factors. Always call this tool as the final step of your analysis."""


class TradingAgent:
    """Trading Agent using Claude Agent SDK with in-process MCP tools.

    Uses ClaudeSDKClient for conversation continuity and automatic tool execution.
    Authentication falls back to Claude Code CLI credentials when no API key is set,
    enabling use with a Claude Pro/Max subscription.
    """

    def __init__(self):
        self._client: ClaudeSDKClient | None = None
        self._tool_calls_this_turn: list[dict] = []
        self._thinking_content_this_turn: str = ""

    async def connect(self) -> None:
        """Initialize the SDK client and start a session.

        Reads auth configuration from AppSettings (DB) with env var fallback.
        """
        from app.agent.auth import resolve_anthropic_api_key
        from app.db.models.app_settings import AppSettings

        server = create_trading_mcp_server()
        app_settings, api_key = await asyncio.gather(
            AppSettings.get_instance(),
            resolve_anthropic_api_key(),
        )

        # Build ThinkingConfig from DB settings
        match app_settings.agent_thinking_mode:
            case "enabled":
                thinking = {
                    "type": "enabled",
                    "budget_tokens": app_settings.agent_thinking_budget,
                }
            case "disabled":
                thinking = {"type": "disabled"}
            case _:
                thinking = {"type": "adaptive"}

        options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            mcp_servers={"trading": server},
            allowed_tools=ALLOWED_TOOL_NAMES,
            permission_mode="bypassPermissions",
            max_turns=10,
            model=app_settings.agent_model or None,
            thinking=thinking,
            effort=app_settings.agent_effort or None,
        )

        if api_key:
            options.env["ANTHROPIC_API_KEY"] = api_key

        self._client = ClaudeSDKClient(options=options)
        await self._client.connect()
        logger.info(
            "Trading agent connected (auth_mode=%s)",
            app_settings.agent_auth_mode.value,
        )

    async def disconnect(self) -> None:
        """Disconnect and clean up the CLI subprocess."""
        if self._client:
            await self._client.disconnect()
            self._client = None
            logger.info("Trading agent disconnected")

    async def _ensure_connected(self) -> None:
        """Connect lazily for background workers using the shared agent instance."""
        if not self._client:
            await self.connect()

    async def chat(
        self,
        user_message: str,
        on_event: Callable | None = None,
    ) -> str:
        """Process a user message and return the agent's response.

        The SDK handles the agentic loop (tool execution, retries) internally.
        Conversation history is maintained by the SDK across calls.

        Args:
            user_message: The user's input message
            on_event: Optional async callback for intermediate events

        Returns:
            The agent's final text response
        """
        await self._ensure_connected()

        self._tool_calls_this_turn = []
        self._thinking_content_this_turn = ""

        with sentry_sdk.start_span(op="ai.agent.chat", description="claude.chat") as span:
            await self._client.query(user_message)

            final_text_parts: list[str] = []

            async for message in self._client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, ThinkingBlock):
                            self._thinking_content_this_turn += block.thinking + "\n"
                            if on_event:
                                await on_event(
                                    {
                                        "type": "thinking",
                                        "data": {"content": block.thinking},
                                    }
                                )

                        elif isinstance(block, ToolUseBlock):
                            tool_info = {
                                "id": block.id,
                                "name": block.name,
                                "arguments": block.input,
                            }
                            self._tool_calls_this_turn.append(tool_info)

                            if on_event:
                                await on_event({"type": "tool_call", "data": tool_info})

                            logger.info(f"Tool called: {block.name}")

                        elif isinstance(block, TextBlock):
                            final_text_parts.append(block.text)

                elif isinstance(message, ResultMessage):
                    if message.is_error:
                        raise RuntimeError(message.result or "Agent SDK returned an error")

                    # Use result text as fallback if no text blocks were collected
                    if message.result and not final_text_parts:
                        final_text_parts.append(message.result)

            span.set_data("tool_calls_count", len(self._tool_calls_this_turn))
            span.set_data(
                "tool_names",
                [tc["name"] for tc in self._tool_calls_this_turn],
            )

        return "".join(final_text_parts)

    @property
    def tool_calls(self) -> list[dict]:
        """Get tool calls from the most recent turn."""
        return self._tool_calls_this_turn

    @property
    def thinking_content(self) -> str:
        """Get accumulated thinking content from the most recent turn."""
        return self._thinking_content_this_turn.strip()

    def _extract_confidence(self, response: str) -> float:
        """Extract confidence percentage from free-form model text."""
        confidence_match = re.search(r"(\d{1,3}(?:\.\d+)?)\s*%", response)
        if not confidence_match:
            return 50.0

        confidence = float(confidence_match.group(1))
        return max(0.0, min(100.0, confidence))

    def _extract_action(self, response: str) -> str | None:
        """Infer BUY/SELL/HOLD/WAIT recommendation from free-form text."""
        response_lower = response.lower()

        action_patterns = [
            (r"\b(recommend|action|decision)\s*:\s*buy\b", "buy"),
            (r"\b(recommend|action|decision)\s*:\s*sell\b", "sell"),
            (r"\b(recommend|action|decision)\s*:\s*hold\b", "hold"),
            (r"\b(recommend|action|decision)\s*:\s*wait\b", "wait"),
            (r"\bbuy\b", "buy"),
            (r"\bsell\b", "sell"),
            (r"\bhold\b", "hold"),
            (r"\bwait\b", "wait"),
        ]

        for pattern, action in action_patterns:
            if re.search(pattern, response_lower):
                return action

        return None

    def _extract_price_value(self, response: str, label: str) -> float | None:
        """Extract numeric price for a given label from free-form text."""
        pattern = rf"{label}\s*[:=]?\s*\$?([0-9]+(?:\.[0-9]+)?)"
        match = re.search(pattern, response, flags=re.IGNORECASE)
        return float(match.group(1)) if match else None

    def _extract_position_size(self, response: str) -> float | None:
        """Extract numeric position size recommendation from free-form text."""
        match = re.search(
            r"position\s*size\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)",
            response,
            flags=re.IGNORECASE,
        )
        return float(match.group(1)) if match else None

    async def analyze(self, user_message: str, user_id: str | None = None) -> dict[str, Any]:
        """Analyze market/trading prompt and normalize output for task scheduler.

        Prefers structured data from the submit_recommendation tool.
        Falls back to regex extraction if the tool was not called.
        """
        _ = user_id
        request_id = uuid.uuid4().hex
        response = await self.chat(user_message)

        # Check for structured recommendation from the submit_recommendation tool
        recommendation = get_pending_recommendation(request_id)

        if recommendation:
            logger.info("Using structured recommendation from submit_recommendation tool")
            summary = recommendation.get("summary", "")
            if len(summary) > 300:
                summary = f"{summary[:297]}..."

            return {
                "summary": summary,
                "reasoning": response,
                "key_factors": recommendation.get("key_factors", []),
                "confidence": recommendation.get("confidence", 50.0),
                "action": recommendation.get("action"),
                "suggested_entry": recommendation.get("entry_price"),
                "suggested_stop_loss": recommendation.get("stop_loss"),
                "suggested_take_profit": recommendation.get("take_profit"),
                "suggested_position_size": recommendation.get("position_size"),
                "tools_used": self.tool_calls,
                "market_context": None,
            }

        # Fallback: regex extraction from free-form text
        logger.warning(
            "submit_recommendation tool was not called; falling back to regex extraction"
        )
        action = self._extract_action(response)
        confidence = self._extract_confidence(response)

        summary = response.strip().split("\n\n")[0]
        if len(summary) > 300:
            summary = f"{summary[:297]}..."

        return {
            "summary": summary,
            "reasoning": response,
            "key_factors": [],
            "confidence": confidence,
            "action": action,
            "suggested_entry": self._extract_price_value(response, "entry(?: price)?"),
            "suggested_stop_loss": self._extract_price_value(
                response,
                r"stop(?:[-\s]?loss)?",
            ),
            "suggested_take_profit": self._extract_price_value(
                response,
                r"take(?:[-\s]?profit)?",
            ),
            "suggested_position_size": self._extract_position_size(response),
            "tools_used": self.tool_calls,
            "market_context": None,
        }

    async def execute_trade(
        self,
        user_id: str,
        symbol: str,
        action: str,
        position_size: float | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        reasoning: str | None = None,
        idempotency_key: str | None = None,
        max_position_size: float | None = None,
        risk_pct: float = 2.0,
    ) -> dict[str, Any]:
        """Execute a trade through OrderExecutor with idempotency and hard limits."""
        from beanie import PydanticObjectId

        from app.agent.subagents.order_executor import OrderExecutor

        with sentry_sdk.start_span(
            op="ai.trade.execute", description=f"trade.{action}.{symbol}"
        ) as span:
            span.set_tag("symbol", symbol)
            span.set_tag("action", action)

            if action not in {"buy", "sell"}:
                return {
                    "success": False,
                    "error": f"Unsupported trade action: {action}",
                }

            try:
                oid = PydanticObjectId(user_id)
            except (TypeError, ValueError):
                return {"success": False, "error": "Invalid user_id for trade execution"}

            executor = OrderExecutor(user_id=oid)
            normalized_idempotency_key = idempotency_key or f"agent-{uuid.uuid4().hex}"

            reasoning_payload = {"reasoning": reasoning} if reasoning else None

            if position_size and position_size > 0:
                result = await executor.execute_trade(
                    symbol=symbol,
                    side=action,
                    quantity=position_size,
                    order_type="market",
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                    reasoning=reasoning_payload,
                    idempotency_key=normalized_idempotency_key,
                    max_position_size=max_position_size,
                )
            else:
                result = await executor.execute_with_risk_params(
                    symbol=symbol,
                    side=action,
                    risk_pct=risk_pct,
                    order_type="market",
                    reasoning=reasoning_payload,
                    idempotency_key=normalized_idempotency_key,
                    max_position_size=max_position_size,
                )

            span.set_data("success", result.get("success", False))
            if result.get("success"):
                result.setdefault("execution_price", result.get("price"))

            return result

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

        action = self._extract_action(response)
        confidence = int(self._extract_confidence(response))

        return {
            "should_trade": action in {"buy", "sell"},
            "confidence": confidence,
            "reasoning": response,
        }


async def create_agent_with_tools() -> TradingAgent:
    """Create and connect a TradingAgent with all MCP tools."""
    agent = TradingAgent()
    await agent.connect()
    return agent
