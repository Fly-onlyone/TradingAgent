"""AI-powered trade lesson extraction from completed trades using Claude."""

import json
import logging

from app.db.models.knowledge import TradeLesson, TradeOutcome, TradeSide
from app.db.models.order import Order
from app.knowledge.embeddings import TradeLessonEmbeddingGenerator

logger = logging.getLogger(__name__)

LESSON_EXTRACTION_TOOL = {
    "name": "save_lesson",
    "description": "Save the extracted trade lesson as structured data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "lesson_summary": {
                "type": "string",
                "description": "A concise summary of the key lesson from this trade (2-4 sentences)",
            },
            "market_context": {
                "type": "object",
                "description": "Market conditions during the trade (trend, volatility, key events, sentiment)",
            },
            "mistakes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Specific mistakes made (e.g. 'Entered against prevailing trend', 'No stop-loss set')",
            },
            "successes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "What went right (e.g. 'Tight stop-loss preserved capital', 'Good entry timing')",
            },
            "recommendations": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Actionable improvements for future trades",
            },
        },
        "required": ["lesson_summary", "market_context"],
    },
}

SYSTEM_PROMPT = """\
You are a trading performance analyst. Given details about a completed cryptocurrency trade, \
extract a structured lesson. Analyze:

1. Entry timing and price action context
2. Risk management (stop-loss, take-profit, position sizing)
3. Exit timing and whether profit was maximized or loss minimized
4. The agent's reasoning and whether it held up

Be specific and actionable. Reference actual prices and percentages. \
Always call the save_lesson tool with your analysis."""

SYSTEM_PROMPT_JSON = """\
You are a trading performance analyst. Given details about a completed cryptocurrency trade, \
extract a structured lesson. Analyze entry/exit timing, risk management, and the agent's reasoning.

Output ONLY a JSON object with these fields (no other text):
{
  "lesson_summary": "2-4 sentence summary of the key lesson",
  "market_context": {"trend": "...", "volatility": "...", "key_events": "..."},
  "mistakes": ["specific mistake 1", ...],
  "successes": ["what went right 1", ...],
  "recommendations": ["actionable improvement 1", ...]
}"""

MAX_REASONING_LENGTH = 5000


def _format_order_for_analysis(order: Order) -> str:
    """Build a human-readable summary of a closed trade for Claude."""
    duration = None
    if order.filled_at and order.closed_at:
        delta = order.closed_at - order.filled_at
        duration = int(delta.total_seconds() / 60)

    parts = [
        f"Symbol: {order.symbol}",
        f"Side: {order.side.value.upper()}",
        f"Entry price: {order.entry_price}",
        f"Exit price: {order.exit_price}",
        f"Quantity: {order.filled_quantity}",
        f"Realized P&L: {order.realized_pnl} ({order.realized_pnl_percent:.2f}%)"
        if order.realized_pnl_percent is not None
        else f"Realized P&L: {order.realized_pnl}",
        f"Fees: {order.fees_paid}" if order.fees_paid else None,
        f"Net P&L: {order.net_pnl}" if order.net_pnl is not None else None,
        f"Stop-loss: {order.stop_loss_price}" if order.stop_loss_price else "Stop-loss: NOT SET",
        f"Take-profit: {order.take_profit_price}" if order.take_profit_price else None,
        f"Duration: {duration} minutes" if duration else None,
        f"Entry time: {order.filled_at}" if order.filled_at else None,
        f"Exit time: {order.closed_at}" if order.closed_at else None,
    ]

    if order.agent_reasoning:
        reasoning_str = json.dumps(order.agent_reasoning, default=str)[:MAX_REASONING_LENGTH]
        parts.append(f"Agent reasoning: {reasoning_str}")

    return "\n".join(p for p in parts if p is not None)


def _determine_outcome(order: Order) -> TradeOutcome:
    """Determine trade outcome from P&L."""
    pnl_pct = order.realized_pnl_percent or 0.0
    if pnl_pct > 0.5:
        return TradeOutcome.PROFIT
    elif pnl_pct < -0.5:
        return TradeOutcome.LOSS
    return TradeOutcome.BREAKEVEN


class TradeLearner:
    """Extract structured lessons from completed trades using Claude.

    Supports two auth modes:
    - api_key: Uses the raw Anthropic client with forced tool_use
    - subscription: Uses ClaudeSDKClient with JSON output
    """

    def __init__(self, api_key: str = "", use_sdk: bool = False) -> None:
        self._api_key = api_key
        self._use_sdk = use_sdk
        if api_key and not use_sdk:
            from anthropic import Anthropic

            self._client = Anthropic(api_key=api_key)
        else:
            self._client = None

    @classmethod
    async def create(cls) -> "TradeLearner":
        """Create a learner with the correct auth mode."""
        from app.agent.auth import resolve_anthropic_api_key

        api_key = await resolve_anthropic_api_key()
        if api_key:
            return cls(api_key=api_key)
        logger.info("TradeLearner using Agent SDK (subscription mode)")
        return cls(use_sdk=True)

    async def extract_lesson(self, order: Order) -> TradeLesson | None:
        """Extract a trade lesson from a closed order.

        Falls back to rule-based analysis if the AI call fails.
        """
        # Skip if lesson already exists for this order
        existing = await TradeLesson.find_one(TradeLesson.order_id == order.id)
        if existing:
            logger.debug("Lesson already exists for order %s", order.id)
            return existing

        try:
            if self._use_sdk:
                lesson = await self._extract_via_sdk(order)
            else:
                lesson = await self._extract_via_api(order)
        except Exception:
            logger.warning(
                "AI lesson extraction failed for order %s, using fallback",
                order.id,
                exc_info=True,
            )
            lesson = self._rule_based_fallback(order)

        if lesson is None:
            return None

        await lesson.insert()

        # Generate embedding
        try:
            generator = TradeLessonEmbeddingGenerator()
            lesson.embedding = await generator.generate_lesson_embedding(lesson.model_dump())
            if lesson.embedding is not None:
                await lesson.save()
        except Exception:
            logger.warning("Failed to generate embedding for lesson %s", lesson.id, exc_info=True)

        logger.info("Trade lesson created for order %s: %s", order.id, lesson.id)
        return lesson

    async def _extract_via_api(self, order: Order) -> TradeLesson:
        """Extract using the raw Anthropic client with forced tool_use."""
        trade_summary = _format_order_for_analysis(order)

        response = self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=[LESSON_EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": "save_lesson"},
            messages=[
                {
                    "role": "user",
                    "content": f"Analyze this completed trade and extract a lesson:\n\n{trade_summary}",
                }
            ],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "save_lesson":
                return self._build_lesson(order, block.input)

        logger.warning("Claude did not call save_lesson tool, using fallback")
        return self._rule_based_fallback(order)

    async def _extract_via_sdk(self, order: Order) -> TradeLesson:
        """Extract using the Agent SDK (works with subscription/CLI credentials)."""
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, TextBlock

        from app.agent.auth import resolve_anthropic_api_key
        from app.db.models.app_settings import AppSettings

        trade_summary = _format_order_for_analysis(order)

        app_settings = await AppSettings.get_instance()
        api_key = await resolve_anthropic_api_key()

        from app.agent.constants import SUPPRESS_CLI_HOOKS
        from app.agent.trading_agent import DISALLOWED_BUILTIN_TOOLS

        options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT_JSON,
            model=app_settings.agent_model or "claude-sonnet-4-6",
            max_turns=1,
            permission_mode="bypassPermissions",
            disallowed_tools=DISALLOWED_BUILTIN_TOOLS,
            extra_args=SUPPRESS_CLI_HOOKS,
        )
        if api_key:
            options.env["ANTHROPIC_API_KEY"] = api_key

        client = ClaudeSDKClient(options=options)
        await client.connect()

        try:
            text_parts: list[str] = []
            await client.query(
                f"Analyze this completed trade and extract a lesson:\n\n{trade_summary}"
            )
            async for message in client.receive_response():
                for block in getattr(message, "content", []):
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)

            raw_text = "".join(text_parts).strip()

            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            data = json.loads(raw_text)
            return self._build_lesson(order, data)
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.warning("Failed to parse SDK lesson response: %s", exc)
            return self._rule_based_fallback(order)
        finally:
            try:
                await client.disconnect()
            except RuntimeError:
                pass

    def _build_lesson(self, order: Order, ai_data: dict) -> TradeLesson:
        """Build a TradeLesson from order data and AI-extracted fields."""
        outcome = _determine_outcome(order)

        duration = None
        if order.filled_at and order.closed_at:
            delta = order.closed_at - order.filled_at
            duration = int(delta.total_seconds() / 60)

        return TradeLesson(
            order_id=order.id,
            outcome=outcome,
            profit_pct=order.realized_pnl_percent or 0.0,
            profit_amount=order.realized_pnl,
            lesson_summary=ai_data.get("lesson_summary", "No lesson extracted"),
            market_context=ai_data.get("market_context", {}),
            mistakes=ai_data.get("mistakes"),
            successes=ai_data.get("successes"),
            recommendations=ai_data.get("recommendations"),
            symbol=order.symbol,
            side=TradeSide(order.side.value),
            entry_price=order.entry_price or 0.0,
            exit_price=order.exit_price or 0.0,
            duration_minutes=duration,
        )

    def _rule_based_fallback(self, order: Order) -> TradeLesson:
        """Create a basic lesson without AI when the API call fails."""
        outcome = _determine_outcome(order)
        pnl_pct = order.realized_pnl_percent or 0.0

        mistakes: list[str] = []
        successes: list[str] = []
        recommendations: list[str] = []

        # Check for missing stop-loss
        if not order.stop_loss_price:
            mistakes.append("No stop-loss was set for this trade")
            recommendations.append("Always set a stop-loss to limit downside risk")

        if outcome == TradeOutcome.LOSS:
            if pnl_pct < -5:
                mistakes.append(
                    f"Large loss of {pnl_pct:.1f}% — position sizing may have been too aggressive"
                )
            recommendations.append("Review entry conditions and consider tighter risk management")
        elif outcome == TradeOutcome.PROFIT:
            successes.append(f"Profitable trade with {pnl_pct:.1f}% return")
            if order.stop_loss_price:
                successes.append("Stop-loss was set, protecting downside")
            if order.take_profit_price:
                successes.append("Take-profit target was defined")

        duration = None
        if order.filled_at and order.closed_at:
            delta = order.closed_at - order.filled_at
            duration = int(delta.total_seconds() / 60)

        return TradeLesson(
            order_id=order.id,
            outcome=outcome,
            profit_pct=pnl_pct,
            profit_amount=order.realized_pnl,
            lesson_summary=(
                f"{order.side.value.upper()} {order.symbol} closed with "
                f"{pnl_pct:+.1f}% {outcome.value}. "
                f"Entry at {order.entry_price}, exit at {order.exit_price}."
            ),
            market_context={},
            mistakes=mistakes or None,
            successes=successes or None,
            recommendations=recommendations or None,
            symbol=order.symbol,
            side=TradeSide(order.side.value),
            entry_price=order.entry_price or 0.0,
            exit_price=order.exit_price or 0.0,
            duration_minutes=duration,
        )
