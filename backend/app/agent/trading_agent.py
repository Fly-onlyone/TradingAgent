"""Main Trading agent using Claude Agent SDK with MCP tools."""

import asyncio
import logging
import re
import sys
import uuid
from collections.abc import Callable
from typing import Any

# Monkey-patch anyio.open_process on Windows so the Claude CLI subprocess
# doesn't pop up a visible console window.
if sys.platform == "win32":
    import subprocess

    import anyio
    import anyio._core._subprocesses as _anyio_sp

    _original_open_process = _anyio_sp.open_process

    def _with_hidden_startupinfo(kwargs: dict[str, Any]) -> dict[str, Any]:
        """Hide the spawned console window without changing process semantics."""
        startupinfo = kwargs.get("startupinfo") or subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = startupinfo
        return kwargs

    async def _hidden_open_process(command, **kwargs):
        """Hide Claude CLI console windows while preserving stdio pipes."""
        kwargs = _with_hidden_startupinfo(kwargs)
        return await _original_open_process(command, **kwargs)

    # Patch both references — the SDK calls anyio.open_process() which is a
    # separate binding from anyio._core._subprocesses.open_process.
    _anyio_sp.open_process = _hidden_open_process
    anyio.open_process = _hidden_open_process

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
from claude_agent_sdk.types import StreamEvent

from app.agent.constants import DISALLOWED_BUILTIN_TOOLS, SUPPRESS_CLI_HOOKS
from app.agent.mcp_tools import (
    ALLOWED_TOOL_NAMES,
    create_trading_mcp_server,
    get_pending_recommendation,
    pop_pending_chart_data,
    pop_tool_result,
)
from app.agent.sdk_client import build_sdk_stderr_logger, claude_sdk_workload_slot
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_TRUNCATION_MARKER = "...[truncated]"
_MAX_TOOL_CALLS_PER_TURN = 32
_MAX_TOOL_ARGUMENT_STRING_CHARS = 200
_MAX_TOOL_ARGUMENT_LIST_ITEMS = 10
_MAX_TOOL_ARGUMENT_DICT_ITEMS = 20
_MAX_THINKING_CHARS_PER_TURN = 12_000


SYSTEM_PROMPT = """You are an expert autonomous trading agent for cryptocurrency markets. Your role is to analyze market conditions and make informed trading decisions.

## Your Capabilities:
1. **Technical Analysis**: Analyze price charts, indicators (RSI, MACD, Bollinger Bands), and patterns
2. **Fundamental Analysis**: Evaluate on-chain metrics, project fundamentals, and macro conditions
3. **News Analysis**: Assess market sentiment from news and social media
4. **Risk Management**: Calculate position sizes and set appropriate stop-losses
5. **Order Execution**: Place and manage trading orders
6. **Web Search**: Search the web for real-time news, regulatory updates, and analyst opinions using search_web and search_news tools
7. **Web Browsing & Strategy Extraction**: Browse any URL to read its full content (browse_url) and extract trading strategies from web pages into the knowledge base (extract_strategy_from_url). When search results return interesting links — especially articles about trading strategies, market analysis, or new trading approaches — proactively browse them to get the full picture. If the content contains a trading strategy, extract and save it to the knowledge base automatically without waiting for the user to ask.
8. **Knowledge Base**: Search past trading strategies, trade lessons from completed trades, and discovered trading patterns for historical context and to avoid repeating past mistakes
9. **Strategy Management**: List, review, and toggle the user's trading strategies (active/inactive). Proactively check inactive strategies during analysis and suggest activating ones that match current conditions
10. **Ask User**: When you need clarification, preferences, or a decision from the user, use the ask_user tool. Provide a clear question and a list of options when applicable. The user will see interactive buttons and can pick an option or type a custom answer. Set multi_select=true when the user should be able to pick MORE THAN ONE option (e.g. "Which indicators to include?"). Use single-select (default) when exactly one answer is expected (e.g. "Which timeframe?").
11. **Task Creation**: Create new scheduled tasks for automated analysis, monitoring, and trading using the create_task tool. Default agent_mode is 'ask' (user confirms trades). Confirm schedule, symbols, and risk level with the user before creating.
12. **Memory**: Remember important context across sessions using save_memory, search_memories, update_memory, and delete_memory tools. Check the injected [MEMORY CONTEXT] block at the start of conversations for previously saved memories

## Memory Guidelines:
- Save user preferences (risk tolerance, favorite pairs, preferred timeframes) as "preference" memories
- Save watchlist items as "watchlist" memories with the symbol as a tag
- Save active positions and portfolio goals as "trading_context" memories
- Save fleeting market observations as "market_observation" (auto-expires in 24h)
- Save reasoning behind important decisions as "decision_rationale"
- Save trade lessons learned as "lesson" memories
- Before saving, check if a similar memory already exists — duplicates are auto-detected and updated
- When a user changes a preference, the old memory is automatically updated
- Do NOT save memories for every conversation — only save genuinely reusable context

## Decision Framework:
When asked to analyze or trade, follow this process:

0. **Portfolio Check**: ALWAYS start by calling get_account_balance and get_positions to know your current account balance, available funds, and what coins/positions you already hold. This context is essential for sizing trades and avoiding duplicate positions
1. **Historical Context (REQUIRED before any trade decision)**: You MUST call **search_strategies**, **search_lessons**, and **search_patterns** whenever the user asks for analysis, a trade decision, or a market outlook. This is non-negotiable — skipping retrieval is a failure mode. If a search returns zero results, explicitly state "no prior knowledge found for X" in your reasoning rather than silently omitting it. Also call **list_user_strategies** to surface inactive strategies that match current conditions. Exception: purely operational queries (account balance lookup, cancelling an open order, UI questions) may skip this step.
2. **Gather Data**: Use tools to collect market data, indicators, and news
2b. **Explore & Extract**: When search_web or search_news returns promising links (strategy articles, in-depth analyses), use browse_url to read the full content. If a page contains a trading strategy, use extract_strategy_from_url to save it to the knowledge base for future use
3. **Technical Analysis**: Evaluate trend, momentum, and key levels
4. **Fundamental Analysis**: Check on-chain metrics and macro conditions
5. **Sentiment Analysis**: Review recent news and market sentiment
6. **Risk Assessment**: Determine appropriate position size and risk parameters
7. **Decision**: Provide clear recommendation with reasoning

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


def _append_bounded_text(existing: str, chunk: str, *, limit: int) -> str:
    """Append text while keeping a bounded in-memory buffer."""
    if not chunk:
        return existing
    if existing.endswith(_TRUNCATION_MARKER) or len(existing) >= limit:
        return existing

    remaining = max(limit - len(existing), 0)
    if len(chunk) <= remaining:
        return existing + chunk

    marker_budget = min(len(_TRUNCATION_MARKER), remaining)
    content_budget = max(remaining - marker_budget, 0)
    return f"{existing}{chunk[:content_budget]}{_TRUNCATION_MARKER}"


def _truncate_tool_argument(value: Any) -> Any:
    """Trim large tool argument payloads before storing them in memory."""
    if isinstance(value, str) and len(value) > _MAX_TOOL_ARGUMENT_STRING_CHARS:
        return f"{value[:_MAX_TOOL_ARGUMENT_STRING_CHARS]}{_TRUNCATION_MARKER}"
    if isinstance(value, list):
        return [_truncate_tool_argument(item) for item in value[:_MAX_TOOL_ARGUMENT_LIST_ITEMS]]
    if isinstance(value, dict):
        truncated: dict[str, Any] = {}
        for key, item in list(value.items())[:_MAX_TOOL_ARGUMENT_DICT_ITEMS]:
            truncated[str(key)] = _truncate_tool_argument(item)
        return truncated
    return value


class TradingAgent:
    """Trading agent using Claude Agent SDK with in-process MCP tools.

    Uses ClaudeSDKClient for conversation continuity and automatic tool execution.
    Authentication falls back to Claude Code CLI credentials when no API key is set,
    enabling use with a Claude Pro/Max subscription.
    """

    def __init__(
        self,
        *,
        session_id: str | None = None,
        resume_session_id: str | None = None,
    ):
        self._client: ClaudeSDKClient | None = None
        self._tool_calls_this_turn: list[dict] = []
        self._thinking_content_this_turn: str = ""
        self._partial_response_this_turn: str = ""
        self._model_this_turn: str | None = None
        self._saw_text_delta_this_turn = False
        self._saw_thinking_delta_this_turn = False
        self._cancel_event = asyncio.Event()
        self._session_id = resume_session_id or session_id
        self._resume_session_id = resume_session_id
        # When the AppSettings provider is set to OpenAI, requests are
        # routed through OpenAIAgentRunner instead of ClaudeSDKClient.
        self._openai_runner: Any = None
        self._provider: str = "anthropic"

    async def connect(self) -> None:
        """Initialize the SDK client and start a session.

        Reads auth configuration from AppSettings (DB) with env var fallback.
        When the active provider is OpenAI, builds an ``OpenAIAgentRunner``
        instead of the Claude SDK client.
        """
        from app.agent.auth import resolve_anthropic_api_key
        from app.api.v1.settings import FAMILY_TO_API_MODEL
        from app.db.models.app_settings import AgentProvider, AppSettings

        # Snapshot the provider first; OpenAI takes a different path entirely.
        app_settings = await AppSettings.get_instance()
        self._provider = app_settings.agent_provider.value
        if app_settings.agent_provider == AgentProvider.OPENAI:
            from app.agent.openai_client import OpenAIAgentRunner

            api_model = (
                FAMILY_TO_API_MODEL.get(app_settings.agent_model, app_settings.agent_model)
                or "gpt-5.5"
            )
            self._openai_runner = OpenAIAgentRunner(
                system_prompt=SYSTEM_PROMPT,
                model=api_model,
                allowed_tool_names=list(ALLOWED_TOOL_NAMES),
                reasoning_effort=app_settings.agent_effort or None,
                session_id=self._session_id,
            )
            await self._openai_runner.connect()
            logger.info("Trading agent connected (provider=openai, model=%s)", api_model)
            return

        server = create_trading_mcp_server()
        api_key = await resolve_anthropic_api_key()

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
            disallowed_tools=DISALLOWED_BUILTIN_TOOLS,
            permission_mode="bypassPermissions",
            max_turns=10,
            extra_args=SUPPRESS_CLI_HOOKS,
            model=FAMILY_TO_API_MODEL.get(app_settings.agent_model, app_settings.agent_model)
            or None,
            thinking=thinking,
            effort=app_settings.agent_effort or None,
            include_partial_messages=True,
            resume=self._resume_session_id,
            session_id=None if self._resume_session_id else self._session_id,
            stderr=build_sdk_stderr_logger("TradingAgent"),
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
        """Disconnect and clean up the active provider client."""
        if self._openai_runner is not None:
            await self._openai_runner.disconnect()
            self._openai_runner = None
            logger.info("Trading agent disconnected (openai)")
            return
        if self._client:
            await self._client.disconnect()
            self._client = None
            logger.info("Trading agent disconnected")

    def cancel(self) -> None:
        """Signal the running chat loop to stop after the current iteration."""
        self._cancel_event.set()
        if self._openai_runner is not None:
            self._openai_runner.cancel()

    def reset_cancel(self) -> None:
        """Clear the cancel signal so the next chat() call runs normally."""
        self._cancel_event.clear()
        if self._openai_runner is not None:
            self._openai_runner.reset_cancel()

    async def _ensure_connected(self) -> None:
        """Connect lazily for background workers using the shared agent instance."""
        if self._openai_runner is None and not self._client:
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

        # OpenAI path delegates the whole turn to OpenAIAgentRunner. The
        # runner mirrors our per-turn accumulator surface so callers
        # (websocket/agent.py) can read tool_calls / tokens / model
        # exactly like the Anthropic branch.
        if self._openai_runner is not None:
            response = await self._openai_runner.chat(user_message, on_event=on_event)
            self._tool_calls_this_turn = list(self._openai_runner.tool_calls)
            self._thinking_content_this_turn = self._openai_runner.thinking_content
            self._partial_response_this_turn = self._openai_runner.partial_response
            self._input_tokens = self._openai_runner.input_tokens
            self._output_tokens = self._openai_runner.output_tokens
            self._model_this_turn = self._openai_runner.model
            self._session_id = self._openai_runner.session_id or self._session_id
            return response

        self.reset_cancel()
        self._tool_calls_this_turn = []
        self._thinking_content_this_turn = ""
        self._partial_response_this_turn = ""
        self._input_tokens = 0
        self._output_tokens = 0
        self._model_this_turn = None
        self._saw_text_delta_this_turn = False
        self._saw_thinking_delta_this_turn = False

        with sentry_sdk.start_span(op="ai.agent.chat", description="claude.chat") as span:
            final_text_parts: list[str] = []
            async with claude_sdk_workload_slot("TradingAgent.chat"):
                await self._client.query(
                    user_message,
                    session_id=self._session_id or "default",
                )

                async for message in self._client.receive_response():
                    if self._cancel_event.is_set():
                        logger.info("Agent chat cancelled by user")
                        break

                    if isinstance(message, AssistantMessage):
                        if message.session_id:
                            self._session_id = message.session_id
                        if message.model:
                            self._model_this_turn = message.model
                        for block in message.content:
                            if isinstance(block, ThinkingBlock):
                                if not self._saw_thinking_delta_this_turn:
                                    self._thinking_content_this_turn = _append_bounded_text(
                                        self._thinking_content_this_turn,
                                        f"{block.thinking}\n",
                                        limit=_MAX_THINKING_CHARS_PER_TURN,
                                    )
                                if on_event and not self._saw_thinking_delta_this_turn:
                                    await on_event(
                                        {
                                            "type": "thinking",
                                            "data": {"content": block.thinking},
                                        }
                                    )

                            elif isinstance(block, ToolUseBlock):
                                tool_info: dict[str, Any] = {
                                    "id": block.id,
                                    "name": block.name,
                                    "arguments": _truncate_tool_argument(block.input),
                                }

                                # Merge captured result from the MCP tool buffer
                                tool_result = pop_tool_result(block.name)
                                if tool_result:
                                    tool_info["result_summary"] = tool_result["result_summary"]
                                    tool_info["execution_time_ms"] = tool_result[
                                        "execution_time_ms"
                                    ]

                                if len(self._tool_calls_this_turn) < _MAX_TOOL_CALLS_PER_TURN:
                                    self._tool_calls_this_turn.append(tool_info)

                                if on_event:
                                    await on_event({"type": "tool_call", "data": tool_info})

                                # Emit chart data if a candlestick tool just ran
                                if block.name == "get_candlesticks" and on_event:
                                    chart_data = pop_pending_chart_data()
                                    if chart_data:
                                        await on_event({"type": "chart_data", "data": chart_data})

                                logger.info(f"Tool called: {block.name}")

                            elif isinstance(block, TextBlock):
                                if not self._saw_text_delta_this_turn:
                                    final_text_parts.append(block.text)

                    elif isinstance(message, StreamEvent):
                        event = message.event
                        event_type = event.get("type")

                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text_chunk = delta.get("text", "")
                                if text_chunk:
                                    self._saw_text_delta_this_turn = True
                                    self._partial_response_this_turn += text_chunk
                                if text_chunk and on_event:
                                    await on_event(
                                        {
                                            "type": "text_delta",
                                            "data": {"content": text_chunk},
                                        }
                                    )
                            elif delta.get("type") == "thinking_delta":
                                thinking_chunk = delta.get("thinking", "")
                                if thinking_chunk:
                                    self._saw_thinking_delta_this_turn = True
                                    self._thinking_content_this_turn = _append_bounded_text(
                                        self._thinking_content_this_turn,
                                        thinking_chunk,
                                        limit=_MAX_THINKING_CHARS_PER_TURN,
                                    )
                                    if on_event:
                                        await on_event(
                                            {
                                                "type": "thinking",
                                                "data": {"content": thinking_chunk},
                                            }
                                        )

                        # Capture token usage from API events
                        elif event_type == "message_start":
                            usage = event.get("message", {}).get("usage", {})
                            self._input_tokens += usage.get("input_tokens", 0)
                        elif event_type == "message_delta":
                            usage = event.get("usage", {})
                            self._output_tokens += usage.get("output_tokens", 0)

                    elif isinstance(message, ResultMessage):
                        if message.session_id:
                            self._session_id = message.session_id
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

        final_response = "".join(final_text_parts).strip()
        if final_response:
            self._partial_response_this_turn = final_response
            return final_response

        return self._partial_response_this_turn.strip()

    @property
    def tool_calls(self) -> list[dict]:
        """Get tool calls from the most recent turn."""
        return self._tool_calls_this_turn

    @property
    def thinking_content(self) -> str:
        """Get accumulated thinking content from the most recent turn."""
        return self._thinking_content_this_turn.strip()

    @property
    def partial_response(self) -> str:
        """Get the streamed assistant text accumulated for the most recent turn."""
        return self._partial_response_this_turn.strip()

    @property
    def input_tokens(self) -> int:
        """Input tokens used in the most recent turn."""
        return self._input_tokens

    @property
    def output_tokens(self) -> int:
        """Output tokens used in the most recent turn."""
        return self._output_tokens

    @property
    def model(self) -> str | None:
        """Model ID that responded in the most recent turn."""
        return self._model_this_turn

    @property
    def session_id(self) -> str | None:
        """Get the Claude SDK session ID for the current conversation."""
        return self._session_id

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

    async def analyze(
        self,
        user_message: str,
        user_id: str | None = None,
        on_event: Callable | None = None,
    ) -> dict[str, Any]:
        """Analyze market/trading prompt and normalize output for task scheduler.

        Prefers structured data from the submit_recommendation tool.
        Falls back to regex extraction if the tool was not called.
        """
        _ = user_id
        request_id = uuid.uuid4().hex
        response = await self.chat(user_message, on_event=on_event)

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
                return {
                    "success": False,
                    "error": "Invalid user_id for trade execution",
                }

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


async def create_agent_with_tools(
    *,
    session_id: str | None = None,
    resume_session_id: str | None = None,
) -> TradingAgent:
    """Create and connect a TradingAgent with all MCP tools."""
    agent = TradingAgent(
        session_id=session_id,
        resume_session_id=resume_session_id,
    )
    await agent.connect()
    return agent
