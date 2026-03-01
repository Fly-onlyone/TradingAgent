"""Trading agent WebSocket endpoints for chat and status."""

import json
import logging
import uuid
from datetime import UTC, datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.agent.trading_agent import create_agent_with_tools
from app.api.v1.auth import _DEV_USER_ID
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
            return await User.find_one(User.email == email)
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

    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    user_id_int = _get_user_id_int(user)
    channel = f"agent:chat:{user_id_int}"
    await manager.connect(websocket, channel, user_id=user_id_int)

    agent = None
    session = None

    async def send_event(event: dict) -> None:
        """Callback for intermediate agent events (thinking, tool_call)."""
        await manager.send_personal(websocket, event)

    try:
        # Validate auth configuration before creating agent
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

        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            try:
                message = json.loads(data)
                user_message = _build_user_message(message)

                if not user_message:
                    continue

                # Lazy session creation — only on first real message to
                # avoid spamming empty sessions on reconnect attempts
                if session is None:
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
                session.add_message(role="user", content=user_message)
                await session.save()

                # Process with trading agent
                try:
                    response = await agent.chat(user_message, on_event=send_event)

                    # Get tool calls and thinking content from this turn
                    tool_calls = agent.tool_calls or []
                    thinking_content = agent.thinking_content or None

                    # Send final response
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

                    # Persist assistant message
                    session.add_message(
                        role="assistant",
                        content=response,
                        tool_calls=tool_calls if tool_calls else None,
                        thinking_content=thinking_content,
                    )
                    if not session.title:
                        session.title = session.generate_title()
                    await session.save()

                except Exception as e:
                    logger.error("Agent error: %s", e, exc_info=True)
                    await manager.send_personal(
                        websocket,
                        {
                            "type": "error",
                            "data": {"error": f"Agent error: {e}"},
                        },
                    )

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

    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: "WebSocket is not connected" — raised by Starlette when
        # the client disconnects before/during receive_text() in some edge cases
        pass
    except Exception as e:
        logger.error("WebSocket handler error: %s", e, exc_info=True)
    finally:
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
