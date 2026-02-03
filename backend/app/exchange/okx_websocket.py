"""OKX WebSocket client for real-time market data and order updates."""

import asyncio
import hashlib
import hmac
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

import websockets
from websockets.client import WebSocketClientProtocol

from app.config import get_settings

logger = logging.getLogger(__name__)


class OKXWebSocket:
    """OKX WebSocket client for real-time data streams."""

    PUBLIC_URL = "wss://ws.okx.com:8443/ws/v5/public"
    PRIVATE_URL = "wss://ws.okx.com:8443/ws/v5/private"
    SANDBOX_PUBLIC_URL = "wss://wspap.okx.com:8443/ws/v5/public?brokerId=9999"
    SANDBOX_PRIVATE_URL = "wss://wspap.okx.com:8443/ws/v5/private?brokerId=9999"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.public_ws: WebSocketClientProtocol | None = None
        self.private_ws: WebSocketClientProtocol | None = None
        self._running = False
        self._callbacks: dict[str, list[Callable[[dict], Coroutine[Any, Any, None]]]] = {}
        self._ping_task: asyncio.Task | None = None
        self._listen_tasks: list[asyncio.Task] = []

    @property
    def public_url(self) -> str:
        """Get public WebSocket URL based on sandbox mode."""
        return self.SANDBOX_PUBLIC_URL if self.settings.okx_sandbox else self.PUBLIC_URL

    @property
    def private_url(self) -> str:
        """Get private WebSocket URL based on sandbox mode."""
        return self.SANDBOX_PRIVATE_URL if self.settings.okx_sandbox else self.PRIVATE_URL

    def _get_login_params(self) -> dict[str, Any]:
        """Generate login parameters for private WebSocket."""
        timestamp = str(int(datetime.now(timezone.utc).timestamp()))
        message = timestamp + "GET" + "/users/self/verify"

        signature = base64.b64encode(
            hmac.new(
                self.settings.okx_secret_key.encode(),
                message.encode(),
                hashlib.sha256,
            ).digest()
        ).decode()

        return {
            "op": "login",
            "args": [
                {
                    "apiKey": self.settings.okx_api_key,
                    "passphrase": self.settings.okx_passphrase,
                    "timestamp": timestamp,
                    "sign": signature,
                }
            ],
        }

    async def connect_public(self) -> None:
        """Connect to public WebSocket for market data."""
        self.public_ws = await websockets.connect(self.public_url)
        logger.info("Connected to OKX public WebSocket")

    async def connect_private(self) -> None:
        """Connect to private WebSocket for account/order updates."""
        self.private_ws = await websockets.connect(self.private_url)

        # Login
        login_params = self._get_login_params()
        await self.private_ws.send(json.dumps(login_params))

        # Wait for login response
        response = await self.private_ws.recv()
        data = json.loads(response)

        if data.get("event") == "login" and data.get("code") == "0":
            logger.info("Logged in to OKX private WebSocket")
        else:
            raise ConnectionError(f"Failed to login to OKX: {data}")

    async def disconnect(self) -> None:
        """Disconnect from WebSocket connections."""
        self._running = False

        if self._ping_task:
            self._ping_task.cancel()

        for task in self._listen_tasks:
            task.cancel()

        if self.public_ws:
            await self.public_ws.close()
            self.public_ws = None

        if self.private_ws:
            await self.private_ws.close()
            self.private_ws = None

        logger.info("Disconnected from OKX WebSockets")

    def on(self, channel: str, callback: Callable[[dict], Coroutine[Any, Any, None]]) -> None:
        """Register callback for a channel.

        Args:
            channel: Channel name (e.g., "tickers", "orders", "candle1m")
            callback: Async function to call with message data
        """
        if channel not in self._callbacks:
            self._callbacks[channel] = []
        self._callbacks[channel].append(callback)

    async def _dispatch(self, channel: str, data: dict) -> None:
        """Dispatch message to registered callbacks."""
        callbacks = self._callbacks.get(channel, [])
        for callback in callbacks:
            try:
                await callback(data)
            except Exception as e:
                logger.error(f"Error in callback for {channel}: {e}")

    # Public Subscriptions
    async def subscribe_ticker(self, inst_id: str) -> None:
        """Subscribe to ticker updates for an instrument."""
        if not self.public_ws:
            await self.connect_public()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": "tickers", "instId": inst_id}],
        }
        await self.public_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to ticker: {inst_id}")

    async def subscribe_orderbook(self, inst_id: str, depth: str = "books5") -> None:
        """Subscribe to orderbook updates.

        Args:
            inst_id: Instrument ID
            depth: "books5" (top 5) or "books" (full depth) or "books50-l2-tbt"
        """
        if not self.public_ws:
            await self.connect_public()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": depth, "instId": inst_id}],
        }
        await self.public_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to orderbook: {inst_id}")

    async def subscribe_trades(self, inst_id: str) -> None:
        """Subscribe to trade updates for an instrument."""
        if not self.public_ws:
            await self.connect_public()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": "trades", "instId": inst_id}],
        }
        await self.public_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to trades: {inst_id}")

    async def subscribe_candlesticks(self, inst_id: str, bar: str = "1m") -> None:
        """Subscribe to candlestick updates.

        Args:
            inst_id: Instrument ID
            bar: Candle interval (1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M)
        """
        if not self.public_ws:
            await self.connect_public()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": f"candle{bar}", "instId": inst_id}],
        }
        await self.public_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to candles: {inst_id} {bar}")

    # Private Subscriptions
    async def subscribe_orders(self, inst_type: str = "SPOT") -> None:
        """Subscribe to order updates."""
        if not self.private_ws:
            await self.connect_private()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": "orders", "instType": inst_type}],
        }
        await self.private_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to orders: {inst_type}")

    async def subscribe_positions(self, inst_type: str = "SPOT") -> None:
        """Subscribe to position updates."""
        if not self.private_ws:
            await self.connect_private()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": "positions", "instType": inst_type}],
        }
        await self.private_ws.send(json.dumps(subscribe_msg))
        logger.info(f"Subscribed to positions: {inst_type}")

    async def subscribe_account(self) -> None:
        """Subscribe to account balance updates."""
        if not self.private_ws:
            await self.connect_private()

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"channel": "account"}],
        }
        await self.private_ws.send(json.dumps(subscribe_msg))
        logger.info("Subscribed to account updates")

    # Listening
    async def _listen_public(self) -> None:
        """Listen for public WebSocket messages."""
        if not self.public_ws:
            return

        async for message in self.public_ws:
            try:
                data = json.loads(message)

                # Handle ping/pong
                if data.get("event") == "ping":
                    await self.public_ws.send(json.dumps({"op": "pong"}))
                    continue

                # Handle subscription confirmation
                if data.get("event") == "subscribe":
                    logger.debug(f"Subscription confirmed: {data}")
                    continue

                # Dispatch to callbacks
                arg = data.get("arg", {})
                channel = arg.get("channel", "")
                await self._dispatch(channel, data)

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {message}")
            except Exception as e:
                logger.error(f"Error processing public message: {e}")

    async def _listen_private(self) -> None:
        """Listen for private WebSocket messages."""
        if not self.private_ws:
            return

        async for message in self.private_ws:
            try:
                data = json.loads(message)

                # Handle ping/pong
                if data.get("event") == "ping":
                    await self.private_ws.send(json.dumps({"op": "pong"}))
                    continue

                # Handle subscription confirmation
                if data.get("event") in ["subscribe", "login"]:
                    logger.debug(f"Event: {data}")
                    continue

                # Dispatch to callbacks
                arg = data.get("arg", {})
                channel = arg.get("channel", "")
                await self._dispatch(channel, data)

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {message}")
            except Exception as e:
                logger.error(f"Error processing private message: {e}")

    async def _keep_alive(self) -> None:
        """Send periodic pings to keep connections alive."""
        while self._running:
            try:
                if self.public_ws:
                    await self.public_ws.send("ping")
                if self.private_ws:
                    await self.private_ws.send("ping")
            except Exception as e:
                logger.error(f"Error sending ping: {e}")

            await asyncio.sleep(25)  # OKX requires ping every 30 seconds

    async def start(self) -> None:
        """Start WebSocket listeners."""
        self._running = True

        # Start listeners
        if self.public_ws:
            self._listen_tasks.append(asyncio.create_task(self._listen_public()))
        if self.private_ws:
            self._listen_tasks.append(asyncio.create_task(self._listen_private()))

        # Start keep-alive
        self._ping_task = asyncio.create_task(self._keep_alive())

        logger.info("OKX WebSocket listeners started")

    async def wait(self) -> None:
        """Wait for all tasks to complete."""
        if self._listen_tasks:
            await asyncio.gather(*self._listen_tasks, return_exceptions=True)
