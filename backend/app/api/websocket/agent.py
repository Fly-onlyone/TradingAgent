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
from app.db.models.notification import NotificationType
from app.db.models.user import User
from app.services.notification_service import get_notification_service

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_RESUME_HISTORY_MESSAGE_LIMIT = 12
_RESUME_HISTORY_CHAR_LIMIT = 12_000
_AGENT_TURN_TIMEOUT_SECONDS = 120.0


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


def _build_resume_history(session: AgentSession) -> str | None:
    """Format recent persisted messages so legacy sessions can resume cleanly."""
    history = session.messages[:-1]
    if not history:
        return None

    recent_history = history[-_RESUME_HISTORY_MESSAGE_LIMIT:]
    rendered_messages = []
    for message in recent_history:
        content = " ".join(message.content.split())
        if not content:
            continue
        rendered_messages.append(f"{message.role.value.title()}: {content}")

    if not rendered_messages:
        return None

    transcript = "\n".join(rendered_messages)
    excerpted = len(history) > len(recent_history)
    if len(transcript) > _RESUME_HISTORY_CHAR_LIMIT:
        excerpted = True
        transcript = transcript[-_RESUME_HISTORY_CHAR_LIMIT:]
        first_newline = transcript.find("\n")
        if first_newline >= 0:
            transcript = transcript[first_newline + 1 :]

    header = "[SESSION CONTEXT - Persisted history loaded for this resumed chat]"
    if excerpted:
        header = f"{header} (recent excerpt)"

    return (
        f"{header}\n"
        "Use this as the conversation history for the current chat and continue naturally.\n"
        f"{transcript}\n"
        "[END SESSION CONTEXT]"
    )


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
    from app.agent.mcp_tools import (
        cancel_pending_questions,
        clear_ws_event_emitter,
        resolve_user_answer,
        set_active_connection_id,
        set_active_session_id,
        set_active_user_id,
        set_ws_event_emitter,
    )

    connection_id = uuid.uuid4().hex
    set_active_user_id(str(user.id))
    set_active_connection_id(connection_id)

    agent = None
    session = None
    chat_task: asyncio.Task | None = None
    chat_cancel_reason: str | None = None

    async def send_event(event: dict) -> None:
        """Callback for intermediate agent events (thinking, tool_call)."""
        await manager.send_personal(websocket, event)

    # Allow the ask_user MCP tool to push questions through this WebSocket
    set_ws_event_emitter(send_event)

    async def _ensure_agent(*, resume_existing_session: bool) -> bool:
        """Lazily create the agent on first use. Returns True if agent is ready."""
        nonlocal agent

        if agent is not None:
            return True

        try:
            await manager.send_personal(
                websocket,
                {
                    "type": "status",
                    "data": {"status": "initializing"},
                },
            )
            with sentry_sdk.start_span(
                op="ws.agent.initialize",
                description="create trading agent (lazy)",
            ):
                resume_session_id = (
                    session.sdk_session_id if session and resume_existing_session else None
                )
                agent = await create_agent_with_tools(
                    session_id=session.sdk_session_id if session else None,
                    resume_session_id=resume_session_id,
                )
            await manager.send_personal(
                websocket,
                {
                    "type": "status",
                    "data": {"status": "connected"},
                },
            )
            return True
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
            return False

    async def _load_session(client_session_id: str | None) -> AgentSession | None:
        """Load an existing session owned by the current user."""
        if not client_session_id:
            return None

        try:
            session_object_id = PydanticObjectId(client_session_id)
        except Exception:
            return None

        return await AgentSession.find_one(
            AgentSession.id == session_object_id,
            AgentSession.user_id == user.id,
        )

    async def _persist_user_message(
        user_message: str,
        *,
        clear_pending_question: bool = True,
    ) -> None:
        """Persist a user message and clear stale pending-question state."""
        if clear_pending_question and session.active_pending_question:
            session.clear_pending_question()

        session.is_active = True
        session.ended_at = None
        session.add_message(role="user", content=user_message)
        await session.save()

    async def _prepare_agent_message(
        user_message: str,
        *,
        inject_session_memories: bool,
        rehydrate_session_history: bool,
    ) -> str:
        """Inject startup context for new sessions and legacy resumed chats."""
        agent_message = user_message
        if inject_session_memories:
            try:
                from app.agent.tools.memory_tools import load_session_memories

                memory_ctx = await load_session_memories(str(user.id))
                if memory_ctx:
                    agent_message = f"{memory_ctx}\n\n{user_message}"
            except Exception:
                logger.debug("Failed to load session memories", exc_info=True)
        elif rehydrate_session_history:
            history_ctx = _build_resume_history(session)
            if history_ctx:
                agent_message = f"{history_ctx}\n\n{user_message}"
        return agent_message

    async def _reset_agent() -> None:
        """Disconnect the current agent when switching persisted sessions."""
        nonlocal agent
        if not agent:
            return

        try:
            await agent.disconnect()
        except Exception:
            logger.warning("Failed to disconnect trading agent cleanly", exc_info=True)
        finally:
            agent = None

    async def _start_chat_turn(
        user_message: str,
        *,
        client_session_id: str | None = None,
        persist_user_message: bool = True,
        broadcast_user_message: bool = False,
        create_session: bool = True,
    ) -> None:
        """Load the target session, persist the user message, and start the agent turn."""
        nonlocal chat_cancel_reason, chat_task, session

        target_session = session
        if client_session_id and (
            target_session is None or str(target_session.id) != client_session_id
        ):
            target_session = await _load_session(client_session_id)
        if target_session is None and create_session:
            target_session = AgentSession(
                user_id=user.id,
                sdk_session_id=str(uuid.uuid4()),
            )
            await target_session.insert()
            await manager.send_personal(
                websocket,
                {
                    "type": "session_created",
                    "data": {"sessionId": str(target_session.id)},
                },
            )

        if target_session is None:
            await manager.send_personal(
                websocket,
                {
                    "type": "error",
                    "data": {"error": "Session not found for answer"},
                },
            )
            return

        prior_message_count = target_session.total_messages
        has_persisted_sdk_session = bool(target_session.sdk_session_id)
        if not has_persisted_sdk_session:
            target_session.sdk_session_id = str(uuid.uuid4())

        previous_session_id = str(session.id) if session else None
        if agent is not None and previous_session_id != str(target_session.id):
            await _reset_agent()

        session = target_session

        if persist_user_message:
            with sentry_sdk.start_span(
                op="db.write",
                description="save user message",
            ):
                await _persist_user_message(user_message)

            if broadcast_user_message:
                await manager.send_personal(
                    websocket,
                    {
                        "type": "message",
                        "data": {
                            "id": str(uuid.uuid4()),
                            "role": "user",
                            "content": user_message,
                            "timestamp": int(datetime.now(UTC).timestamp() * 1000),
                        },
                    },
                )
        else:
            session.is_active = True
            session.ended_at = None
            await session.save()

        # Lazily create the agent on the first turn
        if not await _ensure_agent(
            resume_existing_session=prior_message_count > 0 and has_persisted_sdk_session
        ):
            return

        agent_message = await _prepare_agent_message(
            user_message,
            inject_session_memories=prior_message_count == 0,
            rehydrate_session_history=prior_message_count > 0 and not has_persisted_sdk_session,
        )
        set_active_session_id(str(session.id))
        chat_cancel_reason = None
        chat_task = asyncio.create_task(_process_chat(agent_message))

    async def _send_and_persist_assistant_message(
        content: str,
        tool_calls: list[dict],
        thinking_content: str | None,
        turn_tokens: int,
    ) -> None:
        """Send and save the assistant message for the current turn."""
        if not content.strip():
            return

        await manager.send_personal(
            websocket,
            {
                "type": "message",
                "data": {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": content,
                    "timestamp": int(datetime.now(UTC).timestamp() * 1000),
                    "toolCalls": tool_calls if tool_calls else None,
                    "thinkingContent": thinking_content,
                    "model": agent.model,
                },
            },
        )

        await manager.send_personal(
            websocket,
            {
                "type": "usage",
                "data": {
                    "inputTokens": agent.input_tokens,
                    "outputTokens": agent.output_tokens,
                    "totalTokens": session.total_tokens + turn_tokens,
                    "model": agent.model,
                },
            },
        )

        with sentry_sdk.start_span(
            op="db.write",
            description="save assistant message",
        ):
            if agent.session_id:
                session.sdk_session_id = agent.session_id
            session.add_message(
                role="assistant",
                content=content,
                tool_calls=tool_calls if tool_calls else None,
                thinking_content=thinking_content,
                tokens=turn_tokens,
            )
            if not session.title:
                session.title = session.generate_title()
            await session.save()

        # Fire ANALYSIS_READY notification (persisted + Web Push)
        try:
            notification_svc = get_notification_service()
            preview = content[:200] + "..." if len(content) > 200 else content
            await notification_svc.create_notification(
                user_id=user.id,
                title="Agent response ready",
                body=preview,
                notification_type=NotificationType.ANALYSIS_READY,
                session_id=session.id,
            )
        except Exception:
            logger.debug("Failed to create analysis_ready notification", exc_info=True)

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

        # Agent creation is deferred to first message (_ensure_agent).
        # Send "connected" immediately so the frontend enables the chat input.
        await manager.send_personal(
            websocket,
            {
                "type": "status",
                "data": {"status": "connected"},
            },
        )

        async def _process_chat(user_message: str) -> None:
            """Run agent.chat() and send the result back over the WebSocket."""
            nonlocal chat_cancel_reason, session
            try:
                with sentry_sdk.start_span(
                    op="ws.agent.turn",
                    description="process agent turn",
                ) as turn_span:
                    turn_span.set_data("has_session", session is not None)
                    response = await asyncio.wait_for(
                        agent.chat(user_message, on_event=send_event),
                        timeout=_AGENT_TURN_TIMEOUT_SECONDS,
                    )

                    # Get tool calls, thinking content, and token usage
                    tool_calls = agent.tool_calls or []
                    thinking_content = agent.thinking_content or None
                    turn_tokens = agent.input_tokens + agent.output_tokens

                    await _send_and_persist_assistant_message(
                        content=response,
                        tool_calls=tool_calls,
                        thinking_content=thinking_content,
                        turn_tokens=turn_tokens,
                    )

            except TimeoutError:
                partial_response = agent.partial_response or ""
                logger.warning(
                    "Agent turn timed out after %.1fs",
                    _AGENT_TURN_TIMEOUT_SECONDS,
                    extra={
                        "connection_id": connection_id,
                        "session_id": str(session.id) if session else None,
                        "user_id": str(user.id),
                        "partial_response_length": len(partial_response),
                    },
                )
                if partial_response:
                    await _send_and_persist_assistant_message(
                        content=partial_response,
                        tool_calls=agent.tool_calls or [],
                        thinking_content=agent.thinking_content or None,
                        turn_tokens=agent.input_tokens + agent.output_tokens,
                    )
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "data": {
                            "error": "Agent response timed out before completion. "
                            "A partial answer was saved.",
                        },
                    },
                )
            except asyncio.CancelledError:
                partial_response = agent.partial_response or ""
                logger.info(
                    "Agent turn cancelled",
                    extra={
                        "reason": chat_cancel_reason or "unknown",
                        "connection_id": connection_id,
                        "session_id": str(session.id) if session else None,
                        "user_id": str(user.id),
                        "partial_response_length": len(partial_response),
                    },
                )
                if partial_response:
                    await _send_and_persist_assistant_message(
                        content=partial_response,
                        tool_calls=agent.tool_calls or [],
                        thinking_content=agent.thinking_content or None,
                        turn_tokens=agent.input_tokens + agent.output_tokens,
                    )

                # The cancel_ack is sent by the cancel handler in the receive loop.
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
                    chat_cancel_reason = "user_cancel"
                    await cancel_pending_questions(
                        connection_id=connection_id,
                        clear_persisted=True,
                    )
                    if agent:
                        agent.cancel()
                    chat_task.cancel()
                    try:
                        await chat_task
                    except asyncio.CancelledError:
                        pass
                    chat_task = None
                await manager.send_personal(websocket, {"type": "cancel_ack"})
                continue

            # Handle answers to agent questions (ask_user tool)
            if message.get("type") == "answer_question":
                answer_data = message.get("data", {})
                answer = answer_data.get("answer", "")
                question_session_id = answer_data.get("sessionId")
                if question_session_id:
                    target_session = session
                    if target_session is None or str(target_session.id) != question_session_id:
                        target_session = await _load_session(question_session_id)
                    if target_session:
                        session = target_session
                        with sentry_sdk.start_span(
                            op="db.write",
                            description="save user answer",
                        ):
                            await _persist_user_message(
                                answer,
                                clear_pending_question=False,
                            )

                        await manager.send_personal(
                            websocket,
                            {
                                "type": "message",
                                "data": {
                                    "id": str(uuid.uuid4()),
                                    "role": "user",
                                    "content": answer,
                                    "timestamp": int(datetime.now(UTC).timestamp() * 1000),
                                },
                            },
                        )

                resolution = await resolve_user_answer(
                    answer_data.get("id", ""),
                    answer,
                    user_id=str(user.id),
                    session_id=question_session_id,
                )
                if resolution and resolution.get("status") == "resume_from_history":
                    await _start_chat_turn(
                        answer,
                        client_session_id=resolution.get("session_id"),
                        persist_user_message=False,
                        create_session=False,
                    )
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

            await _start_chat_turn(
                user_message,
                client_session_id=message.get("sessionId"),
            )

    except WebSocketDisconnect as e:
        chat_cancel_reason = "websocket_disconnect"
        logger.info(
            "Agent WebSocket disconnected",
            extra={
                "disconnect_code": getattr(e, "code", None),
                "disconnect_reason": getattr(e, "reason", None),
                "connection_id": connection_id,
                "session_id": str(session.id) if session else None,
                "user_id": str(user.id),
            },
        )
    except RuntimeError as e:
        chat_cancel_reason = "websocket_runtime_disconnect"
        # RuntimeError: "WebSocket is not connected" — raised by Starlette when
        # the client disconnects before/during receive_text() in some edge cases
        logger.warning(
            "Agent WebSocket runtime disconnect: %s",
            e,
            extra={
                "connection_id": connection_id,
                "session_id": str(session.id) if session else None,
                "user_id": str(user.id),
            },
            exc_info=True,
        )
    except Exception as e:
        logger.error("WebSocket handler error: %s", e, exc_info=True)
    finally:
        await cancel_pending_questions(connection_id=connection_id)
        clear_ws_event_emitter()
        if chat_task and not chat_task.done():
            if chat_cancel_reason is None:
                chat_cancel_reason = "handler_shutdown"
            chat_task.cancel()
            try:
                await chat_task
            except (asyncio.CancelledError, Exception):
                pass
        if agent:
            try:
                await agent.disconnect()
            except Exception:
                logger.warning(
                    "Failed to disconnect trading agent cleanly",
                    extra={
                        "connection_id": connection_id,
                        "session_id": str(session.id) if session else None,
                        "user_id": str(user.id),
                    },
                    exc_info=True,
                )
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
