"""Trading agent WebSocket endpoints for chat and status."""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import get_settings
from app.api.websocket.connection_manager import manager

router = APIRouter()
settings = get_settings()


async def get_user_id_from_token(token: str) -> int | None:
    """Extract user ID from JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email = payload.get("sub")
        if email:
            return hash(email) % 1000000
    except JWTError:
        return None
    return None


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

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"agent:chat:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "connected",
                "message": "Connected to trading agent. How can I help you?",
            },
        )

        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            try:
                message = json.loads(data)
                user_message = message.get("message", "")

                # Send acknowledgment
                await manager.send_personal(
                    websocket,
                    {
                        "type": "received",
                        "message": "Processing your request...",
                    },
                )

                # TODO: Process message with Claude trading agent
                # This will be implemented in Phase 5

                # For now, send placeholder response
                await manager.send_personal(
                    websocket,
                    {
                        "type": "response",
                        "message": f"Agent received: {user_message}. "
                        "Full agent capabilities coming soon.",
                    },
                )

            except json.JSONDecodeError:
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "message": "Invalid message format. Send JSON with 'message' field.",
                    },
                )

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id)


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

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"agent:status:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

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
        await manager.disconnect(websocket, channel, user_id=user_id)


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

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"agent:decisions:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

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
        await manager.disconnect(websocket, channel, user_id=user_id)
