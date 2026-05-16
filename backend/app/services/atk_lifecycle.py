"""ATK process lifecycle + sandbox-toggle reload.

Owns:
- App startup: write ~/.okx/config.toml from AppSettings + spawn long-lived
  ATK child for the OpenAI bridge + warm-cache the tools list.
- App shutdown: close MCP client, stop child.
- Sandbox toggle (on_sandbox_toggle): quiesce in-flight writes, rewrite TOML,
  restart ATK child, reconnect bridge, force-disconnect every active
  TradingAgent session (each holds its own demo-profile ATK child via
  claude-agent-sdk), invalidate caches, re-enable writes.

The toggle is serialized by `_TOGGLE_LOCK` so two concurrent toggles can't
race. `process_manager.is_accepting()` is the drain flag the risk hook reads.
"""

from __future__ import annotations

import asyncio
import logging

from app.agent.okx_atk.config_writer import sync_from_app_settings
from app.agent.okx_atk.mcp_client import get_client
from app.agent.okx_atk.process_manager import get_manager, invalidate_command_cache
from app.agent.okx_atk.risk_hook import invalidate_settings_cache
from app.db.models.app_settings import AppSettings

logger = logging.getLogger(__name__)

_started = False
_TOGGLE_LOCK = asyncio.Lock()


async def startup() -> None:
    global _started
    if _started:
        return
    await sync_from_app_settings()
    settings = await AppSettings.get_instance()
    profile = "demo" if settings.okx_sandbox else "live"
    try:
        await get_manager().start(profile=profile)
        await get_client().connect()
        tool_count = len(await get_client().list_tools())
    except Exception:
        # Best-effort: if ATK isn't installed yet (dev machine without
        # `npm install -g @okx_ai/okx-trade-mcp`), don't crash the backend
        # boot. The risk hook will deny any write because the process isn't
        # running, but read tools (chart endpoints) still work via OKXClient.
        logger.exception(
            "ATK startup failed — agent will not have ATK tools until installed/restarted"
        )
        _started = True
        return
    logger.info("ATK lifecycle started profile=%s tools=%d", profile, tool_count)
    _started = True


async def shutdown() -> None:
    global _started
    if not _started:
        return
    try:
        await get_client().close()
        await get_manager().stop()
    except Exception:
        logger.exception("ATK shutdown raised — ignoring")
    _started = False


async def on_sandbox_toggle(new_sandbox: bool) -> None:
    """Called by the settings PUT /exchange endpoint when okx_sandbox flips.

    Quiesces writes via process_manager.set_accepting(False); rewrites TOML;
    restarts ATK child; reconnects MCP client; force-disconnects every active
    TradingAgent session (each spawned its own ATK child from the OLD
    profile); invalidates risk-hook caches; flips accepting back on. Wrapped
    in _TOGGLE_LOCK so concurrent toggles serialize.
    """
    async with _TOGGLE_LOCK:
        mgr = get_manager()
        mgr.set_accepting(False)
        try:
            # Best-effort drain — give in-flight tool calls a beat to settle.
            await asyncio.sleep(0.5)

            await sync_from_app_settings()
            invalidate_command_cache()
            invalidate_settings_cache()

            await get_client().close()
            await mgr.restart(profile="demo" if new_sandbox else "live")
            await get_client().connect()

            # Force-disconnect every active TradingAgent — each holds an ATK
            # child spawned from the OLD profile. Without this, in-flight chats
            # keep trading against the wrong profile until the session ends.
            try:
                from app.agent.registry import get_session_registry

                registry = get_session_registry()
                affected = await registry.disconnect_all(
                    reason=(f"OKX profile changed to {'demo' if new_sandbox else 'live'}")
                )
                logger.info(
                    "Sandbox toggle: %d active TradingAgent session(s) disconnected",
                    affected,
                )
            except ModuleNotFoundError:
                # AgentSessionRegistry not yet implemented — Phase-1 acceptable
                # since today only one session is typically active. Tracked as a
                # follow-up to add backend/app/agent/registry.py when we have
                # multi-session needs.
                logger.warning(
                    "Sandbox toggle: agent.registry missing — active sessions "
                    "may keep old profile until their next reconnect."
                )
        finally:
            mgr.set_accepting(True)
