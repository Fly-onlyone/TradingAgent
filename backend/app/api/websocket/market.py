"""Market data WebSocket endpoints."""

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.api.websocket.connection_manager import manager

router = APIRouter()


@router.websocket("/ticker/{symbol}")
async def ticker_websocket(
    websocket: WebSocket,
    symbol: str,
) -> None:
    """WebSocket for real-time ticker updates for a symbol."""
    channel = f"ticker:{symbol.upper()}"
    await manager.connect(websocket, channel)

    try:
        # Send initial connection confirmation
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": channel,
                "message": f"Subscribed to {symbol.upper()} ticker",
            },
        )

        # Keep connection alive and handle client messages
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong or subscription changes
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel)


@router.websocket("/tickers")
async def tickers_websocket(
    websocket: WebSocket,
    symbols: str = Query(default="BTC-USDT,ETH-USDT"),
) -> None:
    """WebSocket for real-time ticker updates for multiple symbols."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    channels = [f"ticker:{s}" for s in symbol_list]

    # Connect to all requested channels
    for channel in channels:
        await manager.connect(websocket, channel)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channels": channels,
                "message": f"Subscribed to {len(symbol_list)} tickers",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        for channel in channels:
            await manager.disconnect(websocket, channel)


@router.websocket("/orderbook/{symbol}")
async def orderbook_websocket(
    websocket: WebSocket,
    symbol: str,
) -> None:
    """WebSocket for real-time orderbook updates."""
    channel = f"orderbook:{symbol.upper()}"
    await manager.connect(websocket, channel)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": channel,
                "message": f"Subscribed to {symbol.upper()} orderbook",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel)


@router.websocket("/trades/{symbol}")
async def trades_websocket(
    websocket: WebSocket,
    symbol: str,
) -> None:
    """WebSocket for real-time trade updates."""
    channel = f"trades:{symbol.upper()}"
    await manager.connect(websocket, channel)

    try:
        await manager.send_personal(
            websocket,
            {
                "type": "subscribed",
                "channel": channel,
                "message": f"Subscribed to {symbol.upper()} trades",
            },
        )

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, channel)
