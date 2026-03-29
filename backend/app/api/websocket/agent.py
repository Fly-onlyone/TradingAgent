"""Trading agent WebSocket endpoints for chat and status."""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

import sentry_sdk
from beanie import PydanticObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.agent.trading_agent import create_agent_with_tools
from app.api.v1.auth import _DEV_USER_ID, is_token_revoked_by_password_change
from app.api.websocket.connection_manager import manager
from app.config import get_settings
from app.db.models.agent_session import AgentSession
from app.db.models.app_settings import AgentAuthMode, AppSettings
from app.db.models.user import User

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


async def get_user_from_token(token: str) -> User | None:
    """Get authenticated user from JWT token.

    In debug mode, returns a mock superuser without validating the token,
    matching the REST endpoint behaviour (see main.py dependency override).
    """
    if settings.debug and settings.allow_debug_auth_bypass:
        logger.warning("WebSocket auth bypass active — returning mock superuser")
        return User(
            id=_DEV_USER_ID,
            email="dev@localhost.dev",
            hashed_password="",
            full_name="Dev User",
            is_active=True,
            is_superuser=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email = payload.get("sub")
        if email:
            user = await User.find_one(User.email == email)
            if user and is_token_revoked_by_password_change(user, payload):
                logger.warning("WebSocket token invalidated by password change for %s", email)
                return None
            return user
    except JWTError as e:
        logger.warning("WebSocket JWT validation failed: %s", e)
        return None
    return None


def _get_user_id_int(user: User) -> int:
    """Get a deterministic integer user ID for the connection manager."""
    return hash(str(user.id)) % 1000000


def _build_user_message(message: dict) -> str:
    """Extract the user message string from a parsed WebSocket message."""
    msg_type = message.get("type", "message")

    if msg_type == "message":
        return message.get("content", "") or message.get("message", "")
    elif msg_type == "analyze":
        symbol = message.get("symbol", "BTC-USDT")
        analysis_type = message.get("analysisType", "combined")
        return (
            f"Analyze the current market conditions for {symbol}. "
            f"Provide a {analysis_type} analysis with a trading recommendation."
        )
    elif msg_type == "recommend":
        symbol = message.get("symbol", "BTC-USDT")
        return (
            f"Give me a trading recommendation for {symbol}. "
            "Include entry price, stop loss, take profit, and confidence level."
        )
    elif msg_type == "execute":
        decision = message.get("decision", {})
        return (
            f"Execute this trading decision: {json.dumps(decision)}. "
            "Confirm the details and place the order."
        )
    else:
        return message.get("content", "") or message.get("message", "")


@router.websocket("/chat")
async def agent_chat_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for interactive chat with the trading agent.

    Allows users to:
    - Ask questions about market analysis
    - Request trade recommendations
    - Execute trades via natural language
    - Get explanations for agent decisions
    """
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    with sentry_sdk.start_span(op="ws.auth", description="authenticate user"):
        user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    sentry_sdk.set_user({"id": str(user.id), "email": user.email})
    sentry_sdk.set_tag("ws.channel", "agent-chat")
    user_id_int = _get_user_id_int(user)
    channel = f"agent:chat:{user_id_int}"
    with sentry_sdk.start_span(op="ws.connect", description="connect websocket"):
        await manager.connect(websocket, channel, user_id=user_id_int)

    # Set user context for MCP tools (strategy listing, etc.)
    from app.agent.mcp_tools import set_active_user_id

    set_active_user_id(str(user.id))

    agent = None
    session = None
    chat_task: asyncio.Task | None = None

    async def send_event(event: dict) -> None:
        """Callback for intermediate agent events (thinking, tool_call)."""
        await manager.send_personal(websocket, event)

    try:
        # Validate auth configuration before creating agent
        with sentry_sdk.start_span(
            op="ws.agent.config",
            description="validate agent auth",
        ):
            app_settings = await AppSettings.get_instance()
            auth_error: str | None = None

            if app_settings.agent_auth_mode == AgentAuthMode.SUBSCRIPTION:
                from app.api.v1.settings import _check_cli_login

                if not _check_cli_login():
                    auth_error = "Claude CLI not logged in. Use the gear icon to log in."
            elif app_settings.agent_auth_mode == AgentAuthMode.API_KEY:
                if not app_settings.get_agent_api_key() and not settings.anthropic_api_key:
                    auth_error = "No API key configured. Use the gear icon to add one."

        if auth_error:
            await manager.send_personal(
                websocket,
                {
                    "type": "status",
                    "data": {"status": "auth_required", "message": auth_error},
                },
            )
            # Close with 4003 so the frontend knows not to auto-reconnect
            await websocket.close(code=4003, reason=auth_error)
            return

        # Create agent — notify client on failure instead of dying silently
        try:
            with sentry_sdk.start_span(
                op="ws.agent.initialize",
                description="create trading agent",
            ):
                agent = await create_agent_with_tools()
        except Exception as e:
            logger.warning("Failed to create agent: %s", e, exc_info=True)
            await manager.send_personal(
                websocket,
                {
                    "type": "status",
                    "data": {
                        "status": "error",
                        "message": f"Failed to initialize agent: {e}",
                    },
                },
            )
            await websocket.close(code=4002, reason="Agent creation failed")
            return

        await manager.send_personal(
            websocket,
            {
                "type": "status",
                "data": {"status": "connected"},
            },
        )

        async def _process_chat(user_message: str) -> None:
            """Run agent.chat() and send the result back over the WebSocket."""
            nonlocal session
            try:
                with sentry_sdk.start_span(
                    op="ws.agent.turn",
                    description="process agent turn",
                ) as turn_span:
                    turn_span.set_data("has_session", session is not None)
                    response = await agent.chat(user_message, on_event=send_event)

                    # Get tool calls, thinking content, and token usage
                    tool_calls = agent.tool_calls or []
                    thinking_content = agent.thinking_content or None
                    turn_tokens = agent.input_tokens + agent.output_tokens

                    await manager.send_personal(
                        websocket,
                        {
                            "type": "message",
                            "data": {
                                "id": str(uuid.uuid4()),
                                "role": "assistant",
                                "content": response,
                                "timestamp": int(datetime.now(UTC).timestamp() * 1000),
                                "toolCalls": tool_calls if tool_calls else None,
                                "thinkingContent": thinking_content,
                            },
                        },
                    )

                    # Send token usage update
                    await manager.send_personal(
                        websocket,
                        {
                            "type": "usage",
                            "data": {
                                "inputTokens": agent.input_tokens,
                                "outputTokens": agent.output_tokens,
                                "totalTokens": session.total_tokens + turn_tokens,
                            },
                        },
                    )

                    with sentry_sdk.start_span(
                        op="db.write",
                        description="save assistant message",
                    ):
                        session.add_message(
                            role="assistant",
                            content=response,
                            tool_calls=tool_calls if tool_calls else None,
                            thinking_content=thinking_content,
                            tokens=turn_tokens,
                        )
                        if not session.title:
                            session.title = session.generate_title()
                        await session.save()

            except asyncio.CancelledError:
                # Task was cancelled via cancel request. The cancel_ack is sent
                # by the cancel handler in the receive loop, so just re-raise.
                raise
            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.error("Agent error: %s", e, exc_info=True)
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "data": {"error": f"Agent error: {e}"},
                    },
                )

        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "data": {
                            "error": "Invalid message format. Send JSON with 'content' field."
                        },
                    },
                )
                continue

            # Handle cancel requests
            if message.get("type") == "cancel":
                if chat_task and not chat_task.done():
                    agent.cancel()
                    chat_task.cancel()
                    try:
                        await chat_task
                    except asyncio.CancelledError:
                        pass
                    chat_task = None
                await manager.send_personal(websocket, {"type": "cancel_ack"})
                continue

            user_message = _build_user_message(message)
            if not user_message:
                continue

            # Wait for any in-flight chat task before starting a new one
            if chat_task and not chat_task.done():
                try:
                    await chat_task
                except asyncio.CancelledError:
                    pass

            # Lazy session creation — only on first real message to
            # avoid spamming empty sessions on reconnect attempts
            if session is None:
                with sentry_sdk.start_span(
                    op="db.query",
                    description="load or create agent session",
                ):
                    client_session_id = message.get("sessionId")
                    if client_session_id:
                        existing = await AgentSession.find_one(
                            AgentSession.id == PydanticObjectId(client_session_id),
                            AgentSession.user_id == user.id,
                        )
                        if existing:
                            session = existing

                    if session is None:
                        session = AgentSession(user_id=user.id)
                        await session.insert()
                        await manager.send_personal(
                            websocket,
                            {
                                "type": "session_created",
                                "data": {"sessionId": str(session.id)},
                            },
                        )

            # Persist user message
            with sentry_sdk.start_span(
                op="db.write",
                description="save user message",
            ):
                session.add_message(role="user", content=user_message)
                await session.save()

            # Process with trading agent in a task so we can receive
            # cancel messages while the agent is running.
            chat_task = asyncio.create_task(_process_chat(user_message))

    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: "WebSocket is not connected" — raised by Starlette when
        # the client disconnects before/during receive_text() in some edge cases
        pass
    except Exception as e:
        logger.error("WebSocket handler error: %s", e, exc_info=True)
    finally:
        if chat_task and not chat_task.done():
            chat_task.cancel()
            try:
                await chat_task
            except (asyncio.CancelledError, Exception):
                pass
        if agent:
            try:
                await agent.disconnect()
            except Exception:
                pass
        if session:
            try:
                session.end_session()
                await session.save()
            except Exception:
                pass
        await manager.disconnect(websocket, channel, user_id=user_id_int)


@router.websocket("/status")
async def agent_status_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for agent status updates.

    Broadcasts:
    - Agent activity status (analyzing, trading, idle)
    - Active strategy status
    - Current positions being monitored
    - Recent agent decisions
    """
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id_int = _get_user_id_int(user)
    channel = f"agent:status:{user_id_int}"
    await manager.connect(websocket, channel, user_id=user_id_int)

    try:
        # Send initial status
        await manager.send_personal(
            websocket,
            {
                "type": "status",
                "status": "idle",
                "active_strategies": [],
                "monitored_positions": [],
                "last_analysis": None,
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id_int)


@router.websocket("/decisions")
async def agent_decisions_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for real-time agent decision stream.

    Broadcasts:
    - Trade decisions with reasoning
    - Market analysis updates
    - Risk alerts
    - Strategy signals
    """
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id_int = _get_user_id_int(user)
    channel = f"agent:decisions:{user_id_int}"
    await manager.connect(websocket, channel, user_id=user_id_int)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": "decisions",
                "message": "Subscribed to agent decision stream",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id_int)
