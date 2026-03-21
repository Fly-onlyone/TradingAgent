"""Trade learner for extracting lessons from completed trades."""

from datetime import datetime, timezone
from typing import Any, Optional

from anthropic import Anthropic

from app.config import get_settings
from app.db.models.order import Order, OrderStatus
from app.db.models.knowledge import TradeLesson
from app.knowledge.embeddings import TradeLessonEmbeddingGenerator, get_embedding_service

settings = get_settings()


class TradeLearner:
    """Learns from completed trades and extracts actionable lessons."""

    def __init__(self) -> None:
        self.embedding_service = get_embedding_service()
        self.lesson_generator = TradeLessonEmbeddingGenerator()
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    async def analyze_trade(
        self,
        order: Order,
        market_context: dict[str, Any],
        exit_price: Optional[float] = None,
    ) -> TradeLesson:
        """Analyze a completed trade and create a lesson.

        Args:
            order: Completed order to analyze
            market_context: Market conditions during the trade
            exit_price: Exit price if different from avg_fill_price

        Returns:
            Created TradeLesson instance
        """
        if order.status != OrderStatus.FILLED:
            raise ValueError("Can only analyze filled orders")

        entry_price = order.price or order.avg_fill_price or 0
        actual_exit_price = exit_price or order.avg_fill_price or entry_price

        # Calculate profit/loss
        if entry_price > 0:
            if order.side.value == "buy":
                profit_pct = ((actual_exit_price - entry_price) / entry_price) * 100
            else:
                profit_pct = ((entry_price - actual_exit_price) / entry_price) * 100
        else:
            profit_pct = 0.0

        # Determine outcome
        if profit_pct > 0.5:
            outcome = "profit"
        elif profit_pct < -0.5:
            outcome = "loss"
        else:
            outcome = "breakeven"

        # Calculate duration
        duration_minutes = None
        if order.filled_at and order.created_at:
            duration = order.filled_at - order.created_at
            duration_minutes = int(duration.total_seconds() / 60)

        # Generate AI analysis
        analysis = await self._generate_ai_analysis(order, market_context, outcome, profit_pct)

        # Create lesson
        lesson = TradeLesson(
            order_id=order.id,
            outcome=outcome,
            profit_pct=profit_pct,
            profit_amount=(
                order.quantity * (profit_pct / 100) * entry_price if order.quantity else None
            ),
            lesson_summary=analysis["summary"],
            market_context=market_context,
            mistakes=analysis.get("mistakes"),
            successes=analysis.get("successes"),
            recommendations=analysis.get("recommendations"),
            symbol=order.symbol,
            side=order.side.value,
            entry_price=entry_price,
            exit_price=actual_exit_price,
            duration_minutes=duration_minutes,
        )

        # Generate embedding
        lesson_data = {
            "symbol": lesson.symbol,
            "side": lesson.side,
            "outcome": lesson.outcome,
            "profit_pct": lesson.profit_pct,
            "lesson_summary": lesson.lesson_summary,
            "market_context": lesson.market_context,
            "mistakes": lesson.mistakes,
            "successes": lesson.successes,
        }
        lesson.embedding = await self.lesson_generator.generate_lesson_embedding(lesson_data)

        await lesson.insert()
        return lesson

    async def _generate_ai_analysis(
        self,
        order: Order,
        market_context: dict[str, Any],
        outcome: str,
        profit_pct: float,
    ) -> dict[str, Any]:
        """Generate AI-powered trade analysis using Claude."""
        prompt = f"""Analyze this completed trade and provide insights:

Trade Details:
- Symbol: {order.symbol}
- Side: {order.side.value}
- Entry Price: {order.price or order.avg_fill_price}
- Exit Price: {order.avg_fill_price}
- Outcome: {outcome}
- Profit/Loss: {profit_pct:.2f}%

Market Context at Entry:
{self._format_context(market_context)}

Provide a brief analysis with:
1. A 1-2 sentence summary of the trade
2. What went well (if any)
3. What could be improved (if any)
4. Recommendations for similar future trades

Format your response as JSON with keys: summary, successes (list), mistakes (list), recommendations (list)
"""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )

            # Parse response
            text = response.content[0].text if response.content else ""

            # Try to extract JSON
            import json
            import re

            json_match = re.search(r"\{[\s\S]*\}", text)
            if json_match:
                return json.loads(json_match.group())

        except Exception:
            pass

        # Fallback to rule-based analysis
        return self._rule_based_analysis(order, market_context, outcome, profit_pct)

    def _rule_based_analysis(
        self,
        order: Order,
        market_context: dict[str, Any],
        outcome: str,
        profit_pct: float,
    ) -> dict[str, Any]:
        """Rule-based fallback analysis."""
        analysis: dict[str, Any] = {
            "summary": "",
            "mistakes": [],
            "successes": [],
            "recommendations": [],
        }

        side = order.side.value

        if outcome == "profit":
            analysis["summary"] = (
                f"Profitable {side} trade on {order.symbol} with {profit_pct:.2f}% return."
            )
            analysis["successes"].append("Trade direction was correct")
        elif outcome == "loss":
            analysis["summary"] = (
                f"Loss on {side} trade for {order.symbol} with {profit_pct:.2f}% return."
            )
            analysis["mistakes"].append("Trade direction was incorrect")

            if not order.stop_loss_price:
                analysis["mistakes"].append("No stop loss was set")
                analysis["recommendations"].append("Always set a stop loss")
        else:
            analysis["summary"] = f"Breakeven on {side} trade for {order.symbol}."
            analysis["recommendations"].append("Review entry criteria")

        # Check trend alignment
        trend = market_context.get("trend")
        if trend:
            if (side == "buy" and trend == "bearish") or (side == "sell" and trend == "bullish"):
                analysis["mistakes"].append(f"Traded against the {trend} trend")
                analysis["recommendations"].append("Consider trading with the trend")

        # Check RSI
        rsi = market_context.get("rsi")
        if rsi:
            if side == "buy" and rsi > 70:
                analysis["mistakes"].append("Bought in overbought territory")
            elif side == "sell" and rsi < 30:
                analysis["mistakes"].append("Sold in oversold territory")

        return analysis

    def _format_context(self, context: dict[str, Any]) -> str:
        """Format market context for prompt."""
        lines = []
        for key, value in context.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines) if lines else "No context available"

    async def get_lessons_for_symbol(
        self,
        symbol: str,
        limit: int = 10,
    ) -> list[TradeLesson]:
        """Get recent lessons for a specific symbol."""
        return (
            await TradeLesson.find(TradeLesson.symbol == symbol.upper())
            .sort(-TradeLesson.created_at)
            .limit(limit)
            .to_list()
        )

    async def get_loss_patterns(self, limit: int = 20) -> dict[str, Any]:
        """Analyze common patterns in losing trades."""
        losses = (
            await TradeLesson.find(TradeLesson.outcome == "loss")
            .sort(-TradeLesson.created_at)
            .limit(limit)
            .to_list()
        )

        mistake_counts: dict[str, int] = {}
        for lesson in losses:
            if lesson.mistakes:
                for mistake in lesson.mistakes:
                    mistake_counts[mistake] = mistake_counts.get(mistake, 0) + 1

        sorted_mistakes = sorted(mistake_counts.items(), key=lambda x: x[1], reverse=True)

        return {
            "total_losses_analyzed": len(losses),
            "common_mistakes": sorted_mistakes[:5],
            "avg_loss_pct": (sum(l.profit_pct for l in losses) / len(losses) if losses else 0),
        }

    async def get_success_patterns(self, limit: int = 20) -> dict[str, Any]:
        """Analyze common patterns in winning trades."""
        wins = (
            await TradeLesson.find(TradeLesson.outcome == "profit")
            .sort(-TradeLesson.created_at)
            .limit(limit)
            .to_list()
        )

        success_counts: dict[str, int] = {}
        for lesson in wins:
            if lesson.successes:
                for success in lesson.successes:
                    success_counts[success] = success_counts.get(success, 0) + 1

        sorted_successes = sorted(success_counts.items(), key=lambda x: x[1], reverse=True)

        return {
            "total_wins_analyzed": len(wins),
            "common_success_factors": sorted_successes[:5],
            "avg_profit_pct": (sum(l.profit_pct for l in wins) / len(wins) if wins else 0),
        }
