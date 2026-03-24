"""AI-powered strategy extraction from unstructured content using Claude."""

import logging

from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger(__name__)

EXTRACTION_TOOL = {
    "name": "save_strategy",
    "description": "Save the extracted trading strategy as structured data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "A concise name for the strategy (e.g. 'RSI Divergence Reversal')",
            },
            "description": {
                "type": "string",
                "description": "A 1-3 sentence summary of the strategy's approach and edge",
            },
            "entry_rules": {
                "type": "object",
                "description": "Conditions to enter a trade. Keys should be descriptive rule names, values are the rule details.",
            },
            "exit_rules": {
                "type": "object",
                "description": "Conditions to exit a trade (take-profit, stop-loss, trailing stop, time-based, etc.)",
            },
            "risk_params": {
                "type": "object",
                "description": "Risk management parameters (position size %, max drawdown %, risk-reward ratio, etc.)",
            },
            "symbols": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Trading pairs this strategy applies to (e.g. ['BTC-USDT', 'ETH-USDT']). Use OKX format.",
            },
            "timeframes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Timeframes for analysis (e.g. ['1H', '4H', '1D'])",
            },
            "market_conditions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Market conditions the strategy works best in (e.g. ['trending', 'high_volatility'])",
            },
            "asset_classes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Asset classes (e.g. ['crypto', 'major_pairs', 'altcoins'])",
            },
        },
        "required": ["name", "description", "entry_rules", "exit_rules", "risk_params"],
    },
}

SYSTEM_PROMPT = """\
You are a trading strategy analyst. Your task is to extract structured trading strategy data \
from the provided content. The content may be an article, blog post, research paper, or raw data.

Extract as much actionable detail as possible. For entry/exit rules, be specific about indicators, \
thresholds, and conditions. For risk parameters, extract position sizing, stop-loss rules, and \
risk-reward ratios when mentioned.

If the content doesn't describe a complete strategy, extract whatever is available and use \
reasonable defaults for missing fields. Always call the save_strategy tool with your extraction."""

MAX_CONTENT_LENGTH = 30_000


class ExtractedStrategy(BaseModel):
    """AI-extracted strategy data."""

    name: str
    description: str
    entry_rules: dict = {}
    exit_rules: dict = {}
    risk_params: dict = {}
    symbols: list[str] = []
    timeframes: list[str] = []
    market_conditions: list[str] = []
    asset_classes: list[str] = []


class StrategyExtractor:
    """Extract structured strategy data from unstructured content using Claude."""

    def __init__(self) -> None:
        from anthropic import Anthropic

        settings = get_settings()
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    async def extract_from_text(self, content: str, source_hint: str = "") -> ExtractedStrategy:
        """Send content to Claude and extract structured strategy fields."""
        truncated = content[:MAX_CONTENT_LENGTH]
        hint = f"\n\nSource: {source_hint}" if source_hint else ""

        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": "save_strategy"},
            messages=[
                {
                    "role": "user",
                    "content": f"Extract the trading strategy from this content:{hint}\n\n{truncated}",
                }
            ],
        )

        # Extract tool call input
        for block in response.content:
            if block.type == "tool_use" and block.name == "save_strategy":
                return ExtractedStrategy(**block.input)

        # Fallback: shouldn't happen with tool_choice forced
        logger.warning("Claude did not call save_strategy tool, using fallback")
        return ExtractedStrategy(
            name="Imported Strategy",
            description="Strategy extracted from provided content (extraction incomplete)",
        )
