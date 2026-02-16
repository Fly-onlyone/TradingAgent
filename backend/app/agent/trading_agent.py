"""Main Trading Agent using Claude Agent SDK with MCP tools."""

import logging
import re
from collections.abc import Callable

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
)

from app.agent.mcp_tools import ALLOWED_TOOL_NAMES, create_trading_mcp_server
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
        app_settings = await AppSettings.get_instance()

        # Use thinking budget from DB settings (0 = disabled)
        thinking_tokens = app_settings.agent_max_thinking_tokens or None

        options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            mcp_servers={"trading": server},
            allowed_tools=ALLOWED_TOOL_NAMES,
            permission_mode="bypassPermissions",
            max_turns=10,
            max_thinking_tokens=thinking_tokens,
        )

        # Resolve API key: DB → env var → empty (CLI credentials)
        api_key = await resolve_anthropic_api_key()
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
        if not self._client:
            raise RuntimeError("Agent not connected. Call connect() first.")

        self._tool_calls_this_turn = []
        self._thinking_content_this_turn = ""
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

        return "".join(final_text_parts)

    @property
    def tool_calls(self) -> list[dict]:
        """Get tool calls from the most recent turn."""
        return self._tool_calls_this_turn

    @property
    def thinking_content(self) -> str:
        """Get accumulated thinking content from the most recent turn."""
        return self._thinking_content_this_turn.strip()

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

        should_trade = "yes" in response.lower()[:100]
        confidence = 50

        confidence_match = re.search(r"(\d+)%", response)
        if confidence_match:
            confidence = int(confidence_match.group(1))

        return {
            "should_trade": should_trade,
            "confidence": confidence,
            "reasoning": response,
        }


async def create_agent_with_tools() -> TradingAgent:
    """Create and connect a TradingAgent with all MCP tools."""
    agent = TradingAgent()
    await agent.connect()
    return agent
