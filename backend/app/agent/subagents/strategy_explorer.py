"""Strategy Explorer subagent — agentic scout that finds article candidates.

Runs a `ClaudeSDKClient` tool_use loop with the explorer-scoped MCP server
(`search_web`, `search_news`, `fetch_article`, `list_configured_sources`,
`has_been_extracted`, `submit_candidates`). Persists its whole chat into a
dedicated `AgentSession` so users can open it in the existing viewer.

The agent does NOT extract strategies itself — it returns a ranked list of
candidates that the orchestrator fans out to parallel
`StrategyExtractorAgent` subagents.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from beanie import PydanticObjectId
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
)

from app.agent.auth import resolve_anthropic_api_key
from app.agent.explorer_tools import (
    create_explorer_mcp_server,
    explorer_allowed_tool_names,
)
from app.agent.sdk_client import claude_sdk_workload_slot
from app.agent.session_recorder import (
    AgentSessionRecorder,
    create_subagent_session,
)
from app.db.models.agent_session import AgentSession, persist_session_message

logger = logging.getLogger(__name__)

SessionCreatedCallback = Callable[[PydanticObjectId], Awaitable[None]]

# Max SDK turns inside the Explorer tool_use loop. The agent is instructed
# to call `submit_candidates` to terminate; this is the hard safety ceiling.
_MAX_TURNS = 20

STRATEGY_EXPLORER_PROMPT = """You are a crypto-trading-strategy scout. Your job is to find \
articles that describe tradeable strategies and hand them off for extraction.

## Your tools (all via MCP)
- `search_web(query, count, freshness)` — Brave web search.
- `search_news(query, count, freshness)` — Brave news search.
- `list_configured_sources()` — the user's curated strategy-extraction feeds. \
Call this ONCE per cycle early on to prioritize known-good domains.
- `fetch_article(url, max_chars)` — pull the full article body (trafilatura). \
Only call this on URLs that look promising from search snippets.
- `has_been_extracted(urls)` — returns which URLs are already in the knowledge \
base. ALWAYS filter candidates through this BEFORE adding them.
- `submit_candidates(candidates)` — hand off your final list and STOP.

## Policy
1. Start with `list_configured_sources()` to see curated feeds, then branch out via web search.
2. Use diverse queries: vary asset (BTC/ETH/alts), style (momentum, mean-reversion, \
breakout), timeframe (scalping, swing, positional). Don't just repeat the same search.
3. For each promising hit: skim snippet → if strategy-like, check `has_been_extracted` → \
if unknown, optionally `fetch_article` to confirm depth → add to candidates.
4. Stop when you have up to `max_candidates` strong candidates OR three consecutive \
searches return nothing new you haven't already seen.
5. Final step: call `submit_candidates` with a ranked list (best first). Keep each \
candidate to {url, title, reason}. Do NOT extract the strategy yourself.

## Do NOT
- Re-search URLs already returned by `has_been_extracted`.
- Fetch more than ~10 articles per cycle (Brave rate limits + token budget).
- Include non-strategy articles (price commentary, news summaries without a \
tradeable rule, opinion pieces).
"""


@dataclass
class ArticleCandidate:
    url: str
    title: str
    reason: str = ""


@dataclass
class ExplorerResult:
    session_id: PydanticObjectId
    candidates: list[ArticleCandidate]
    error: str | None = None


class StrategyExplorerAgent:
    """Agentic scout; emits a list of `ArticleCandidate` via `submit_candidates`."""

    def __init__(
        self,
        *,
        user_id: PydanticObjectId,
        max_candidates: int = 20,
        cycle_id: PydanticObjectId | None = None,
    ) -> None:
        self.user_id = user_id
        self.max_candidates = max_candidates
        self.cycle_id = cycle_id
        self._client: ClaudeSDKClient | None = None
        self.session: AgentSession | None = None

    async def run(
        self,
        on_session_created: SessionCreatedCallback | None = None,
    ) -> ExplorerResult:
        """Run one Explorer cycle.

        `on_session_created` fires the moment the AgentSession row is
        inserted so the orchestrator can stamp `cycle.explorer_session_id`
        immediately — otherwise the Tasks card "Explorer" button stays
        disabled for the entire run.
        """
        title = (
            f"Strategy Explorer — cycle {self.cycle_id}" if self.cycle_id else "Strategy Explorer"
        )
        self.session = await create_subagent_session(
            user_id=self.user_id,
            title=title,
            description=f"max_candidates={self.max_candidates}",
        )
        if on_session_created is not None:
            try:
                await on_session_created(self.session.id)
            except Exception:
                logger.debug("on_session_created hook failed", exc_info=True)
        recorder = AgentSessionRecorder(self.session)
        candidates: list[ArticleCandidate] = []

        try:
            await self._connect()
        except Exception as exc:
            await recorder.record_system_note(f"Explorer connect failed: {exc}")
            await recorder.end()
            return ExplorerResult(
                session_id=self.session.id,
                candidates=[],
                error=str(exc),
            )

        try:
            user_prompt = (
                f"Discover up to {self.max_candidates} trading-strategy articles. "
                f"Use your tools, filter against has_been_extracted, and submit the "
                f"final list via submit_candidates. Do not extract strategies yourself."
            )
            await recorder.record_user_message(user_prompt)
            async with claude_sdk_workload_slot("StrategyExplorer.run"):
                await self._client.query(user_prompt)
                candidates = await self._collect_turns(recorder)
        except Exception as exc:
            logger.exception("Explorer run failed")
            await recorder.record_system_note(f"Explorer error: {exc}")
            await recorder.end()
            return ExplorerResult(
                session_id=self.session.id,
                candidates=[],
                error=str(exc),
            )
        finally:
            await self._disconnect()

        await recorder.record_system_note(
            f"Explorer complete: {len(candidates)} candidate(s) submitted."
        )
        await recorder.end()

        return ExplorerResult(session_id=self.session.id, candidates=candidates)

    # ------------------------------------------------------------------
    # SDK client lifecycle
    # ------------------------------------------------------------------

    async def _connect(self) -> None:
        from app.agent.constants import SUPPRESS_CLI_HOOKS
        from app.agent.trading_agent import DISALLOWED_BUILTIN_TOOLS

        server = create_explorer_mcp_server()
        options = ClaudeAgentOptions(
            system_prompt=STRATEGY_EXPLORER_PROMPT,
            mcp_servers={"strategy_explorer": server},
            allowed_tools=explorer_allowed_tool_names(),
            disallowed_tools=DISALLOWED_BUILTIN_TOOLS,
            permission_mode="bypassPermissions",
            max_turns=_MAX_TURNS,
            extra_args=SUPPRESS_CLI_HOOKS,
        )
        api_key = await resolve_anthropic_api_key()
        if api_key:
            options.env["ANTHROPIC_API_KEY"] = api_key
        self._client = ClaudeSDKClient(options=options)
        await self._client.connect()
        logger.info("StrategyExplorer connected (session=%s)", self.session.id)

    async def _disconnect(self) -> None:
        if self._client is not None:
            try:
                await self._client.disconnect()
            except RuntimeError:
                pass  # cancel-scope mismatches on shutdown are benign
            self._client = None

    # ------------------------------------------------------------------
    # Stream handling
    # ------------------------------------------------------------------

    async def _collect_turns(self, recorder: AgentSessionRecorder) -> list[ArticleCandidate]:
        """Drain `receive_response()` until `submit_candidates` fires or stream ends.

        Persists every assistant turn (text + tool_use) into the Explorer's
        session via the recorder, so the chat viewer sees the live tool loop.
        """
        candidates: list[ArticleCandidate] = []
        submitted = False

        text_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls: list[dict] = []
        turn_tokens = 0

        async def flush_assistant_turn() -> None:
            nonlocal text_parts, thinking_parts, tool_calls, turn_tokens
            content = "".join(text_parts).strip()
            if not content and not tool_calls:
                return
            final_content = content or "(tool use only)"
            final_tool_calls = tool_calls or None
            final_thinking = "".join(thinking_parts).strip() or None
            await persist_session_message(
                recorder.session,
                role="assistant",
                content=final_content,
                tool_calls=final_tool_calls,
                thinking_content=final_thinking,
                tokens=turn_tokens,
            )
            await recorder.session.save()
            # Broadcast to the agent WebSocket so the chat viewer streams live.
            # See `.claude/rules/code-guide.md` "Chat-Session Features" rule.
            from app.agent.session_recorder import (
                broadcast_assistant_message,
                broadcast_thinking,
            )

            await broadcast_assistant_message(
                recorder.session,
                role="assistant",
                content=final_content,
                tool_calls=final_tool_calls,
                thinking_content=final_thinking,
                # More turns coming as long as the loop used tools — keep
                # the sidebar spinner on.
                keep_running=bool(final_tool_calls),
            )
            # If this turn used tools, more turns are coming — keep the chat
            # thinking pill alive in the UI until the next message arrives.
            if final_tool_calls:
                await broadcast_thinking(recorder.session, thinking=True)
            text_parts = []
            thinking_parts = []
            tool_calls = []
            turn_tokens = 0

        async for message in self._client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in getattr(message, "content", []):
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
                    elif isinstance(block, ThinkingBlock):
                        thinking_parts.append(getattr(block, "thinking", "") or "")
                    elif isinstance(block, ToolUseBlock):
                        tool_name = getattr(block, "name", "")
                        tool_input = getattr(block, "input", {}) or {}
                        tool_calls.append(
                            {
                                "id": getattr(block, "id", ""),
                                "name": tool_name,
                                "arguments": tool_input,
                            }
                        )
                        if tool_name.endswith("submit_candidates"):
                            candidates = self._parse_candidates(tool_input)
                            submitted = True
            elif isinstance(message, ResultMessage):
                usage = getattr(message, "usage", None)
                if usage is not None:
                    turn_tokens = int(getattr(usage, "input_tokens", 0) or 0) + int(
                        getattr(usage, "output_tokens", 0) or 0
                    )
                # Stream ended; flush the last turn.
                await flush_assistant_turn()
                break

            # Flush at message boundary so the UI streams turn-by-turn.
            if isinstance(message, AssistantMessage):
                await flush_assistant_turn()

        if not submitted:
            # Agent stopped without calling submit_candidates — salvage by
            # scanning text for a URL list would be hostile. Return [].
            logger.warning(
                "Explorer terminated without submit_candidates (session=%s)",
                self.session.id,
            )

        return candidates[: self.max_candidates]

    @staticmethod
    def _parse_candidates(tool_input: dict[str, Any]) -> list[ArticleCandidate]:
        raw = tool_input.get("candidates")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                return []
        if not isinstance(raw, list):
            return []
        candidates: list[ArticleCandidate] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            if not url:
                continue
            candidates.append(
                ArticleCandidate(
                    url=url,
                    title=str(item.get("title") or url),
                    reason=str(item.get("reason") or ""),
                )
            )
        return candidates
