"""Order updates WebSocket endpoints."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.api.websocket.connection_manager import manager
from app.config import get_settings

router = APIRouter()
settings = get_settings()


async def get_user_id_from_token(token: str) -> int | None:
    """Extract user ID from JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # In a real implementation, you'd look up the user by email
        # For now, we'll use a simplified approach
        email = payload.get("sub")
        if email:
            # Use a deterministic placeholder ID until user lookup is wired.
            return hash(email) % 1000000
    except JWTError:
        return None
    return None


@router.websocket("")
async def orders_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for real-time order updates.

    Requires authentication via token query parameter.
    """
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"orders:user:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": "orders",
                "message": "Subscribed to order updates",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id)


@router.websocket("/positions")
async def positions_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for real-time position updates."""
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"positions:user:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": "positions",
                "message": "Subscribed to position updates",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id)


@router.websocket("/balance")
async def balance_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """WebSocket for real-time balance updates."""
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"balance:user:{user_id}"
    await manager.connect(websocket, channel, user_id=user_id)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": "balance",
                "message": "Subscribed to balance updates",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel, user_id=user_id)
