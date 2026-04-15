"""Shared constants and small helpers for agent/subagent code paths."""

from __future__ import annotations

from beanie import PydanticObjectId

# Passed to `ClaudeAgentOptions(extra_args=...)` on every SDK caller so the
# Claude Code CLI subprocess ignores the user's global settings (hooks etc.)
# and only uses project-local settings. Without this, every subagent's Stop
# hook fires a toast on completion — see `.claude/rules/code-guide.md`
# "Chat-Session Features" leg "Suppress Claude CLI hooks".
SUPPRESS_CLI_HOOKS: dict[str, str] = {"setting-sources": "local"}

# Built-in Claude Code tools that don't work in a headless subprocess.
# The agent should ask questions via the ask_user MCP tool instead.
DISALLOWED_BUILTIN_TOOLS: list[str] = [
    "AskUserQuestion",
    "AskFollowupQuestion",
    "ToolSearch",
]


def agent_channel_user_id(user_id: PydanticObjectId | str) -> int:
    """Deterministic channel-partition key for the agent WebSocket.

    Must match `_get_user_id_int` in `backend/app/api/websocket/agent.py`
    so `manager.send_to_user` and `manager.broadcast_to_channel("agent:chat:<id>")`
    route to the same connection.
    """
    return hash(str(user_id)) % 1000000
