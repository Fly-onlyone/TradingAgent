"""AI-powered merger that consolidates multiple AgentTasks into one.

Used by the ``POST /agent/tasks/merge-duplicates`` endpoint to deduplicate
legacy tasks that accumulated before the single-task cap was enforced.
"""

import json
import logging
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


MERGE_TOOL = {
    "name": "save_merged_task",
    "description": (
        "Return the single consolidated task that best captures the intent of "
        "ALL the input tasks. Preserve every symbol the user cares about, "
        "combine instructions without losing important detail, and choose the "
        "capability toggles conservatively (prefer alerts/ask-mode over auto)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "A short descriptive name for the merged task (<=80 chars).",
            },
            "description": {
                "type": "string",
                "description": "1-3 sentence summary combining the goals of the source tasks.",
            },
            "symbols": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Union of all symbols across the source tasks, deduped, OKX format (e.g. BTC-USDT).",
            },
            "custom_instructions": {
                "type": "string",
                "description": (
                    "Single consolidated instruction block that preserves specific "
                    "numbers, price levels, position sizes, and escalation rules from "
                    "ALL source tasks. Group by topic, don't lose detail."
                ),
            },
            "trading_enabled": {
                "type": "boolean",
                "description": "True iff ANY source task had trading_enabled=true.",
            },
            "monitoring_enabled": {
                "type": "boolean",
                "description": "True iff ANY source task had monitoring_enabled=true.",
            },
            "use_subagents": {
                "type": "boolean",
                "description": "True iff ANY source task had use_subagents=true.",
            },
            "risk_level": {
                "type": "string",
                "enum": ["conservative", "moderate", "aggressive"],
                "description": "Pick the MOST CONSERVATIVE level among the inputs.",
            },
            "agent_mode": {
                "type": "string",
                "enum": ["ask", "auto"],
                "description": "Default to 'ask' unless ALL inputs were 'auto'.",
            },
            "max_position_size": {
                "type": ["number", "null"],
                "description": "Smallest non-null max_position_size, or null.",
            },
            "max_daily_trades": {
                "type": ["integer", "null"],
                "description": "Smallest non-null max_daily_trades, or null.",
            },
            "preferred_source_index": {
                "type": "integer",
                "description": (
                    "0-based index of the source task whose schedule should be kept. "
                    "Prefer the task with the most recent activity or most symbols."
                ),
            },
        },
        "required": [
            "name",
            "description",
            "symbols",
            "custom_instructions",
            "trading_enabled",
            "monitoring_enabled",
            "use_subagents",
            "risk_level",
            "agent_mode",
            "preferred_source_index",
        ],
    },
}


SYSTEM_PROMPT = """\
You consolidate multiple trading-agent tasks into ONE merged task without \
losing important user intent.

Rules:
- symbols: take the UNION across all inputs, deduped.
- custom_instructions: preserve every specific price level, position size, \
stop-loss, take-profit, escalation rule, and user preference mentioned in ANY \
input. Reorganize for clarity but do not drop specifics.
- Capability flags (trading_enabled, monitoring_enabled, use_subagents): OR them.
- risk_level: pick the MOST CONSERVATIVE (conservative < moderate < aggressive).
- agent_mode: default 'ask' unless ALL inputs were 'auto'.
- max_position_size / max_daily_trades: smallest non-null, or null.
- preferred_source_index: index of the source task whose schedule we should \
keep (prefer the one with real activity — most symbols or most run_count).

Always call the save_merged_task tool. Do not skip any specific rule."""


SYSTEM_PROMPT_JSON = (
    SYSTEM_PROMPT
    + """

Output ONLY a JSON object matching the save_merged_task schema. No prose."""
)


class MergedTask(BaseModel):
    """AI-produced merged task payload."""

    name: str
    description: str = ""
    symbols: list[str] = []
    custom_instructions: str = ""
    trading_enabled: bool = False
    monitoring_enabled: bool = False
    use_subagents: bool = False
    risk_level: str = "moderate"
    agent_mode: str = "ask"
    max_position_size: float | None = None
    max_daily_trades: int | None = None
    preferred_source_index: int = 0


def _task_to_summary(task: Any, idx: int) -> dict:
    """Serialize a task to a compact dict the LLM can reason over."""
    return {
        "index": idx,
        "name": task.name,
        "description": task.description or "",
        "symbols": list(task.symbols),
        "custom_instructions": task.custom_instructions or "",
        "trading_enabled": task.trading_enabled,
        "monitoring_enabled": task.monitoring_enabled,
        "use_subagents": task.use_subagents,
        "risk_level": task.risk_level.value
        if hasattr(task.risk_level, "value")
        else str(task.risk_level),
        "agent_mode": task.agent_mode.value
        if hasattr(task.agent_mode, "value")
        else str(task.agent_mode),
        "max_position_size": task.max_position_size,
        "max_daily_trades": task.max_daily_trades,
        "run_count": task.run_count,
        "last_run_at": task.last_run_at.isoformat() if task.last_run_at else None,
    }


class TaskMerger:
    """Merge multiple AgentTasks into one using the active provider.

    Three modes: Anthropic api_key, Anthropic subscription (SDK), OpenAI api_key.
    """

    def __init__(
        self,
        *,
        provider: str = "anthropic",
        api_key: str = "",
        use_sdk: bool = False,
    ) -> None:
        self._provider = provider
        self._api_key = api_key
        self._use_sdk = use_sdk
        self._last_used_fallback = False
        self._openai_client = None
        if provider == "openai" and api_key:
            from openai import AsyncOpenAI

            self._openai_client = AsyncOpenAI(api_key=api_key)
            self._client = None
        elif provider == "anthropic" and api_key and not use_sdk:
            from anthropic import Anthropic

            self._client = Anthropic(api_key=api_key)
        else:
            self._client = None

    @classmethod
    async def create(cls) -> "TaskMerger":
        """Pick the right backend based on the configured provider."""
        from app.agent.auth import resolve_active_provider_api_key

        provider, api_key = await resolve_active_provider_api_key()
        if provider == "openai":
            if not api_key:
                raise RuntimeError("OpenAI provider selected but no API key configured.")
            return cls(provider="openai", api_key=api_key)

        if api_key:
            return cls(provider="anthropic", api_key=api_key)
        logger.info("TaskMerger using Agent SDK (subscription mode)")
        return cls(provider="anthropic", use_sdk=True)

    async def merge(self, tasks: list[Any]) -> MergedTask:
        """Return a consolidated task payload for ``tasks``.

        Tries the AI path first (api_key or SDK) and falls back to a
        deterministic merge if the AI call fails, returns empty, or produces
        invalid JSON. Guarantees a usable result without raising, so the
        endpoint never hard-fails on transient LLM issues.
        """
        if len(tasks) < 2:
            raise ValueError("merge() requires at least 2 tasks")

        summaries = [_task_to_summary(t, i) for i, t in enumerate(tasks)]
        user_message = (
            "Merge these tasks into one. Preserve all symbols and all specific "
            "instructions:\n\n" + json.dumps(summaries, indent=2, default=str)
        )

        try:
            if self._provider == "openai":
                return await self._merge_via_openai(user_message)
            if self._use_sdk:
                return await self._merge_via_sdk(user_message)
            return await self._merge_via_api(user_message)
        except Exception as exc:
            logger.warning("AI merge failed (%s); falling back to deterministic merge", exc)
            self._last_used_fallback = True
            return _deterministic_merge(tasks)

    async def _merge_via_openai(self, user_message: str) -> MergedTask:
        """Merge via OpenAI Chat Completions with a forced function-call."""
        from app.api.v1.settings import FAMILY_TO_API_MODEL, _normalize_to_family
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()
        family = _normalize_to_family(app_settings.agent_model)
        model = FAMILY_TO_API_MODEL.get(family, family) or "gpt-5.5"

        openai_tool = {
            "type": "function",
            "function": {
                "name": MERGE_TOOL["name"],
                "description": MERGE_TOOL["description"],
                "parameters": MERGE_TOOL["input_schema"],
            },
        }

        completion = await self._openai_client.chat.completions.create(
            model=model,
            max_completion_tokens=4096,
            tools=[openai_tool],
            tool_choice={
                "type": "function",
                "function": {"name": MERGE_TOOL["name"]},
            },
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        choice = completion.choices[0] if completion.choices else None
        tool_calls = choice.message.tool_calls if choice and choice.message else None
        if tool_calls:
            for call in tool_calls:
                if call.function.name == MERGE_TOOL["name"]:
                    payload = json.loads(call.function.arguments or "{}")
                    return MergedTask(**payload)
        raise RuntimeError("OpenAI did not return a save_merged_task call")

    async def _merge_via_api(self, user_message: str) -> MergedTask:
        response = self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[MERGE_TOOL],
            tool_choice={"type": "tool", "name": "save_merged_task"},
            messages=[{"role": "user", "content": user_message}],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "save_merged_task":
                return MergedTask(**block.input)

        raise RuntimeError("Claude did not call save_merged_task tool")

    async def _merge_via_sdk(self, user_message: str) -> MergedTask:
        from app.agent.sdk_client import (
            build_sdk_client,
            claude_sdk_workload_slot,
            collect_text_response,
        )
        from app.api.v1.settings import DEFAULT_MODEL_BY_FAMILY
        from app.db.models.app_settings import AppSettings

        app_settings = await AppSettings.get_instance()

        # Resolve family alias (e.g. "opus-1m") to a real SDK model id;
        # an unknown alias causes the SDK to return empty content.
        raw_model = (app_settings.agent_model or "").strip()
        resolved_model = (
            DEFAULT_MODEL_BY_FAMILY.get(raw_model.lower())
            or (raw_model if raw_model.startswith("claude-") else None)
            or "claude-sonnet-4-6"
        )

        client = await build_sdk_client(
            system_prompt=SYSTEM_PROMPT_JSON,
            model=resolved_model,
            stderr_source="TaskMerger",
        )
        await client.connect()
        try:
            async with claude_sdk_workload_slot("TaskMerger._merge_via_sdk"):
                await client.query(user_message)
                raw = (await collect_text_response(client, source="TaskMerger")).strip()
            if not raw:
                raise RuntimeError(f"SDK returned empty response (model={resolved_model})")

            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            data = json.loads(raw)
            return MergedTask(**data)
        finally:
            try:
                await client.disconnect()
            except RuntimeError:
                pass  # cancel scope mismatch — safe to ignore


_RISK_RANK = {"conservative": 0, "moderate": 1, "aggressive": 2}


def _deterministic_merge(tasks: list[Any]) -> MergedTask:
    """Rule-based merge used when AI is unavailable or returns garbage.

    Safe, predictable behaviour: union symbols, OR flags, most-conservative
    risk, ask-mode if any input was ask, smallest non-null numeric caps,
    concatenates every task's custom_instructions so nothing is lost.
    """
    # Union of symbols preserving first-seen order
    seen: set[str] = set()
    symbols: list[str] = []
    for t in tasks:
        for s in t.symbols:
            if s not in seen:
                seen.add(s)
                symbols.append(s)

    # Concatenate custom_instructions as a numbered list, skipping empties
    instruction_parts: list[str] = []
    for i, t in enumerate(tasks):
        ci = (t.custom_instructions or "").strip()
        if ci:
            instruction_parts.append(f"[From task {i + 1} — {t.name}]\n{ci}")
    custom_instructions = "\n\n".join(instruction_parts)

    # Pick description: longest non-empty among inputs
    description = ""
    for t in tasks:
        d = (t.description or "").strip()
        if len(d) > len(description):
            description = d

    # Name: prefer the most-run task's name, fallback to first
    name_task = max(tasks, key=lambda t: (t.run_count, len(t.symbols)))
    name = (name_task.name or "Consolidated Task")[:100]

    # Risk: most conservative
    risk_vals = [(getattr(t.risk_level, "value", None) or str(t.risk_level)).lower() for t in tasks]
    risk_level = min(risk_vals, key=lambda r: _RISK_RANK.get(r, 1), default="moderate")
    if risk_level not in _RISK_RANK:
        risk_level = "moderate"

    # Agent mode: "ask" unless ALL are auto
    modes = [(getattr(t.agent_mode, "value", None) or str(t.agent_mode)).lower() for t in tasks]
    agent_mode = "auto" if modes and all(m == "auto" for m in modes) else "ask"

    # Smallest non-null numeric caps
    pos_sizes = [t.max_position_size for t in tasks if t.max_position_size is not None]
    daily_trades = [t.max_daily_trades for t in tasks if t.max_daily_trades is not None]

    # Preferred source: index of most-run (or most-symbols) task
    preferred_idx = max(
        range(len(tasks)),
        key=lambda i: (tasks[i].run_count, len(tasks[i].symbols)),
    )

    return MergedTask(
        name=name,
        description=description,
        symbols=symbols,
        custom_instructions=custom_instructions,
        trading_enabled=any(t.trading_enabled for t in tasks),
        monitoring_enabled=any(t.monitoring_enabled for t in tasks),
        use_subagents=any(t.use_subagents for t in tasks),
        risk_level=risk_level,
        agent_mode=agent_mode,
        max_position_size=min(pos_sizes) if pos_sizes else None,
        max_daily_trades=min(daily_trades) if daily_trades else None,
        preferred_source_index=preferred_idx,
    )
