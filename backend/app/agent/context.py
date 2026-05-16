"""ContextVars carrying per-request agent context into stateless hook callbacks.

`claude-agent-sdk`'s pre-tool hooks fire from the SDK's own asyncio task. The
only way to get user_id / session_id / message_id / tool_use_id into that
callback is via a ContextVar set by the caller (the WS handler) and copied
into the agent task via `asyncio.create_task(coro, context=copy_context())`.

If a contextvar is unset at hook execution time, the hook denies any write
with "no user_id in tool context" — that's the fail-closed contract.

Background-scheduler invocations (autonomous trading triggered by
services/scheduler.py etc.) MUST also set `current_user_id_var` before
starting the agent.
"""

from __future__ import annotations

import contextvars

current_user_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_user_id", default=None
)
current_session_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_session_id", default=None
)
current_message_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_message_id", default=None
)
current_tool_use_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_tool_use_id", default=None
)
