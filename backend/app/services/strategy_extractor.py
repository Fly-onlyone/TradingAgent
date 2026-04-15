"""AI-powered strategy extraction from unstructured content using Claude."""

import json
import logging

from pydantic import BaseModel

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

# Variant for subscription mode (no tool_use, output JSON directly)
SYSTEM_PROMPT_JSON = """\
You are a trading strategy analyst. Extract structured trading strategy data from the provided content.

Extract as much actionable detail as possible. For entry/exit rules, be specific about indicators, \
thresholds, and conditions. For risk parameters, extract position sizing, stop-loss rules, and \
risk-reward ratios when mentioned.

Output ONLY a JSON object with these fields (no other text):
{
  "name": "strategy name",
  "description": "1-3 sentence summary",
  "entry_rules": {"rule_name": "rule details", ...},
  "exit_rules": {"rule_name": "rule details", ...},
  "risk_params": {"param_name": "value", ...},
  "symbols": ["BTC-USDT", ...],
  "timeframes": ["1H", "4H", ...],
  "market_conditions": ["trending", ...],
  "asset_classes": ["crypto", ...]
}"""

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
    extraction_messages: list[dict] = []


class StrategyExtractor:
    """Extract structured strategy data from unstructured content using Claude.

    Supports two auth modes:
    - api_key: Uses the raw Anthropic client with forced tool_use (fast, precise)
    - subscription: Uses ClaudeSDKClient with JSON output (works with CLI credentials)
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
    async def create(cls) -> "StrategyExtractor":
        """Create an extractor with the correct auth mode."""
        from app.agent.auth import resolve_anthropic_api_key

        api_key = await resolve_anthropic_api_key()
        if api_key:
            return cls(api_key=api_key)
        # No API key — use Agent SDK (subscription mode)
        logger.info("StrategyExtractor using Agent SDK (subscription mode)")
        return cls(use_sdk=True)

    async def extract_from_text(self, content: str, source_hint: str = "") -> ExtractedStrategy:
        """Send content to Claude and extract structured strategy fields."""
        if self._use_sdk:
            return await self._extract_via_sdk(content, source_hint)
        return await self._extract_via_api(content, source_hint)

    async def _extract_via_api(self, content: str, source_hint: str) -> ExtractedStrategy:
        """Extract using the raw Anthropic client with forced tool_use."""
        truncated = content[:MAX_CONTENT_LENGTH]
        hint = f"\n\nSource: {source_hint}" if source_hint else ""
        word_count = len(truncated.split())

        messages: list[dict] = []
        if source_hint:
            messages.append({"role": "system", "content": f"Fetching content from: {source_hint}"})
        messages.append(
            {
                "role": "system",
                "content": f"Content loaded ({word_count} words). Starting AI extraction...",
            }
        )

        response = self._client.messages.create(
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

        for block in response.content:
            if block.type == "tool_use" and block.name == "save_strategy":
                result = ExtractedStrategy(**block.input)
                messages.append(
                    {
                        "role": "assistant",
                        "content": f"I found a trading strategy. Extracted: {result.name} — {result.description}",
                    }
                )
                messages.append({"role": "system", "content": "Strategy extracted successfully"})
                result.extraction_messages = messages
                return result

        logger.warning("Claude did not call save_strategy tool, using fallback")
        messages.append(
            {"role": "system", "content": "AI did not return structured data; using fallback"}
        )
        result = ExtractedStrategy(
            name="Imported Strategy",
            description="Strategy extracted from provided content (extraction incomplete)",
        )
        result.extraction_messages = messages
        return result

    async def _extract_via_sdk(self, content: str, source_hint: str) -> ExtractedStrategy:
        """Extract using the Agent SDK (works with subscription/CLI credentials)."""

        from claude_agent_sdk import (
            ClaudeAgentOptions,
            ClaudeSDKClient,
            TextBlock,
        )

        from app.agent.auth import resolve_anthropic_api_key
        from app.db.models.app_settings import AppSettings

        truncated = content[:MAX_CONTENT_LENGTH]
        hint = f"\n\nSource: {source_hint}" if source_hint else ""
        word_count = len(truncated.split())

        messages: list[dict] = []
        if source_hint:
            messages.append({"role": "system", "content": f"Fetching content from: {source_hint}"})
        messages.append(
            {
                "role": "system",
                "content": f"Content loaded ({word_count} words). Starting AI extraction (SDK)...",
            }
        )

        app_settings = await AppSettings.get_instance()
        api_key = await resolve_anthropic_api_key()

        from app.agent.constants import SUPPRESS_CLI_HOOKS
        from app.agent.trading_agent import DISALLOWED_BUILTIN_TOOLS
        from app.api.v1.settings import FAMILY_TO_API_MODEL

        # Map settings family alias ("sonnet"/"opus") → API model id
        # ("claude-sonnet-4-6"). Passing the raw family name made the SDK
        # return empty text and silently fall through to the "Imported
        # Strategy" placeholder, which the extractor subagent then rejects.
        family = app_settings.agent_model or "sonnet"
        api_model = FAMILY_TO_API_MODEL.get(family, family)

        options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT_JSON,
            model=api_model,
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
            user_message = f"Extract the trading strategy from this content:{hint}\n\n{truncated}"

            await client.query(user_message)
            async for message in client.receive_response():
                for block in getattr(message, "content", []):
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)

            raw_text = "".join(text_parts).strip()

            # Extract JSON from response (may be wrapped in ```json blocks)
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            data = json.loads(raw_text)
            result = ExtractedStrategy(**data)
            messages.append(
                {
                    "role": "assistant",
                    "content": f"I found a trading strategy. Extracted: {result.name} — {result.description}",
                }
            )
            messages.append({"role": "system", "content": "Strategy extracted successfully"})
            result.extraction_messages = messages
            return result
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.warning("Failed to parse SDK extraction response: %s", exc)
            messages.append({"role": "system", "content": f"SDK extraction failed: {exc}"})
            result = ExtractedStrategy(
                name="Imported Strategy",
                description="Strategy extracted from provided content (extraction incomplete)",
            )
            result.extraction_messages = messages
            return result
        finally:
            try:
                await client.disconnect()
            except RuntimeError:
                pass  # cancel scope task mismatch — safe to ignore
