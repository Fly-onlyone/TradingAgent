"""WebSocket connection manager for real-time broadcasts."""

import asyncio
import json
from typing import Any
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self) -> None:
        # Active connections by channel
        self.active_connections: dict[str, list[WebSocket]] = defaultdict(list)
        # User-specific connections
        self.user_connections: dict[int, list[WebSocket]] = defaultdict(list)
        # Lock for thread safety
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        channel: str,
        user_id: int | None = None,
    ) -> None:
        """Accept connection and add to channel."""
        await websocket.accept()
        async with self._lock:
            self.active_connections[channel].append(websocket)
            if user_id:
                self.user_connections[user_id].append(websocket)

    async def disconnect(
        self,
        websocket: WebSocket,
        channel: str,
        user_id: int | None = None,
    ) -> None:
        """Remove connection from channel."""
        async with self._lock:
            if websocket in self.active_connections[channel]:
                self.active_connections[channel].remove(websocket)
            if user_id and websocket in self.user_connections[user_id]:
                self.user_connections[user_id].remove(websocket)

    async def broadcast_to_channel(self, channel: str, message: dict[str, Any]) -> None:
        """Broadcast message to all connections in a channel."""
        connections = self.active_connections.get(channel, [])
        if not connections:
            return

        data = json.dumps(message)
        disconnected = []

        for connection in connections:
            try:
                await connection.send_text(data)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        async with self._lock:
            for conn in disconnected:
                if conn in self.active_connections[channel]:
                    self.active_connections[channel].remove(conn)

    async def send_to_user(self, user_id: int, message: dict[str, Any]) -> None:
        """Send message to specific user's connections."""
        connections = self.user_connections.get(user_id, [])
        if not connections:
            return

        data = json.dumps(message)
        disconnected = []

        for connection in connections:
            try:
                await connection.send_text(data)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        async with self._lock:
            for conn in disconnected:
                if conn in self.user_connections[user_id]:
                    self.user_connections[user_id].remove(conn)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        """Send message to specific connection."""
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    def get_channel_count(self, channel: str) -> int:
        """Get number of connections in a channel."""
        return len(self.active_connections.get(channel, []))

    def get_all_channels(self) -> list[str]:
        """Get all active channels."""
        return list(self.active_connections.keys())


# Global connection manager instance
manager = ConnectionManager()
