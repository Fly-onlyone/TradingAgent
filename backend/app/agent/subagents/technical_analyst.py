"""Technical Analyst subagent for chart patterns and indicators."""

import logging
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
)

from app.agent.tools.technical_tools import (
    detect_chart_patterns,
    get_price_action,
    get_technical_indicators,
)
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

TECHNICAL_ANALYST_PROMPT = """You are an expert technical analyst specializing in cryptocurrency markets. Your role is to analyze price charts, indicators, and patterns to provide trading signals.

## Your Expertise:
1. **Trend Analysis**: Moving averages, MACD, trend lines
2. **Momentum Indicators**: RSI, Stochastic, Williams %R
3. **Volatility Analysis**: Bollinger Bands, ATR
4. **Pattern Recognition**: Chart patterns, candlestick patterns
5. **Support/Resistance**: Key levels, pivot points

## Analysis Framework:
When analyzing a market:
1. Identify the primary trend (bullish/bearish/sideways)
2. Check momentum indicators for overbought/oversold conditions
3. Look for chart patterns and candlestick signals
4. Identify key support and resistance levels
5. Assess volatility and potential move magnitude

## Output Format:
Always provide:
- Trend direction with confidence
- Key indicator readings and interpretation
- Important price levels (support/resistance)
- Chart patterns detected
- Clear signal: BUY / SELL / HOLD with reasoning"""


class TechnicalAnalyst:
    """Technical analysis subagent."""

    def __init__(self):
        self._client: ClaudeSDKClient | None = None

    async def connect(self) -> None:
        """Initialize the SDK client."""
        options = ClaudeAgentOptions(
            system_prompt=TECHNICAL_ANALYST_PROMPT,
            permission_mode="bypassPermissions",
            max_turns=1,
        )
        if settings.anthropic_api_key:
            options.env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
        self._client = ClaudeSDKClient(options=options)
        await self._client.connect()
        logger.info("TechnicalAnalyst connected")

    async def disconnect(self) -> None:
        """Disconnect and clean up."""
        if self._client:
            await self._client.disconnect()
            self._client = None
            logger.info("TechnicalAnalyst disconnected")

    async def _collect_response(self) -> str:
        """Collect text from SDK response stream."""
        parts: list[str] = []
        async for message in self._client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        parts.append(block.text)
            elif isinstance(message, ResultMessage):
                if message.is_error:
                    raise RuntimeError(message.result or "TechnicalAnalyst SDK error")
                if message.result and not parts:
                    parts.append(message.result)
        return "".join(parts)

    async def analyze(self, symbol: str, timeframe: str = "1H") -> dict[str, Any]:
        """Perform technical analysis on a symbol.

        Args:
            symbol: Trading pair (e.g., BTC-USDT)
            timeframe: Analysis timeframe

        Returns:
            Technical analysis results with signals
        """
        if not self._client:
            raise RuntimeError("Analyst not connected. Call connect() first.")

        # Gather technical data
        indicators = await get_technical_indicators(symbol, timeframe)
        patterns = await detect_chart_patterns(symbol, timeframe)
        price_action = await get_price_action(symbol, timeframe)

        # Build context for Claude
        context = f"""
Symbol: {symbol}
Timeframe: {timeframe}

## Technical Indicators:
{self._format_indicators(indicators)}

## Chart Patterns:
{self._format_patterns(patterns)}

## Price Action:
{self._format_price_action(price_action)}

Based on this technical data, provide your analysis and trading signal.
"""

        # Get Claude's analysis via SDK
        await self._client.query(context)
        analysis_text = await self._collect_response()

        # Extract signal from analysis
        signal = self._extract_signal(analysis_text)

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "indicators": indicators.get("indicators", {}),
            "patterns": patterns.get("patterns", []),
            "price_action": price_action,
            "analysis": analysis_text,
            "signal": signal,
        }

    def _format_indicators(self, data: dict) -> str:
        """Format indicators for prompt."""
        if "error" in data:
            return f"Error: {data['error']}"

        indicators = data.get("indicators", {})
        lines = [
            f"Current Price: {data.get('current_price')}",
            f"Trend: {indicators.get('trend', 'unknown')}",
            "",
            "Moving Averages:",
            f"  SMA 20: {indicators.get('sma_20')}",
            f"  SMA 50: {indicators.get('sma_50')}",
            f"  EMA 12: {indicators.get('ema_12')}",
            f"  EMA 26: {indicators.get('ema_26')}",
            "",
            "MACD:",
            f"  Line: {indicators.get('macd', {}).get('line')}",
            f"  Signal: {indicators.get('macd', {}).get('signal')}",
            f"  Histogram: {indicators.get('macd', {}).get('histogram')}",
            "",
            "Momentum:",
            f"  RSI (14): {indicators.get('rsi_14')} ({indicators.get('rsi_signal', '')})",
            f"  Stochastic K: {indicators.get('stochastic', {}).get('k')}",
            f"  Stochastic D: {indicators.get('stochastic', {}).get('d')}",
            "",
            "Bollinger Bands:",
            f"  Upper: {indicators.get('bollinger_bands', {}).get('upper')}",
            f"  Middle: {indicators.get('bollinger_bands', {}).get('middle')}",
            f"  Lower: {indicators.get('bollinger_bands', {}).get('lower')}",
            f"  Position: {indicators.get('bb_position')} (0=lower, 1=upper)",
            "",
            "Pivot Points:",
            f"  R2: {indicators.get('pivot_points', {}).get('r2')}",
            f"  R1: {indicators.get('pivot_points', {}).get('r1')}",
            f"  Pivot: {indicators.get('pivot_points', {}).get('pivot')}",
            f"  S1: {indicators.get('pivot_points', {}).get('s1')}",
            f"  S2: {indicators.get('pivot_points', {}).get('s2')}",
        ]
        return "\n".join(lines)

    def _format_patterns(self, data: dict) -> str:
        """Format patterns for prompt."""
        if "error" in data:
            return f"Error: {data['error']}"

        patterns = data.get("patterns", [])
        if not patterns:
            return "No significant patterns detected"

        lines = []
        for p in patterns:
            lines.append(
                f"- {p.get('pattern')}: {p.get('type')} (confidence: {p.get('confidence')}%)"
            )
            lines.append(f"  {p.get('description')}")
        return "\n".join(lines)

    def _format_price_action(self, data: dict) -> str:
        """Format price action for prompt."""
        if "error" in data:
            return f"Error: {data['error']}"

        lines = [
            f"Price Direction: {data.get('price_direction')}",
            f"Volatility: {data.get('volatility_pct')}%",
            f"Last Close: {data.get('last_close')}",
            "",
            "Candlestick Patterns:",
        ]

        for p in data.get("candlestick_patterns", []):
            lines.append(f"  - {p.get('pattern')}: {p.get('signal')}")

        return "\n".join(lines)

    def _extract_signal(self, analysis: str) -> dict:
        """Extract trading signal from analysis text."""
        analysis_lower = analysis.lower()

        # Determine signal
        if "strong buy" in analysis_lower or "strongly bullish" in analysis_lower:
            signal = "STRONG_BUY"
            confidence = 80
        elif "buy" in analysis_lower and "sell" not in analysis_lower[:100]:
            signal = "BUY"
            confidence = 65
        elif "strong sell" in analysis_lower or "strongly bearish" in analysis_lower:
            signal = "STRONG_SELL"
            confidence = 80
        elif "sell" in analysis_lower and "buy" not in analysis_lower[:100]:
            signal = "SELL"
            confidence = 65
        else:
            signal = "HOLD"
            confidence = 50

        return {
            "action": signal,
            "confidence": confidence,
        }
