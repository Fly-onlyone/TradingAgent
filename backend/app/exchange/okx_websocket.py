"""OKX WebSocket client for real-time market data and order updates."""

import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from okx.websocket.WsPrivateAsync import WsPrivateAsync
from okx.websocket.WsPublicAsync import WsPublicAsync

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
        self.api_key = self.settings.okx_api_key
        self.secret_key = self.settings.okx_secret_key
        self.passphrase = self.settings.okx_passphrase
        self.sandbox = self.settings.okx_sandbox
        self.public_ws: WsPublicAsync | None = None
        self.private_ws: WsPrivateAsync | None = None
        self._running = False
        self._callbacks: dict[str, list[Callable[[dict], Coroutine[Any, Any, None]]]] = {}

    @classmethod
    async def create(cls) -> "OKXWebSocket":
        """Create websocket client with DB settings (fallback to env vars)."""
        from app.db.models.app_settings import AppSettings

        instance = cls()
        try:
            app_settings = await AppSettings.get_instance()
            resolved_api_key = app_settings.get_okx_api_key()
            resolved_secret_key = app_settings.get_okx_secret_key()
            resolved_passphrase = app_settings.get_okx_passphrase()

            if resolved_api_key:
                instance.api_key = resolved_api_key
            if resolved_secret_key:
                instance.secret_key = resolved_secret_key
            if resolved_passphrase:
                instance.passphrase = resolved_passphrase
            instance.sandbox = app_settings.okx_sandbox
        except Exception:
            logger.warning(
                "Failed to load OKX websocket credentials from AppSettings — using env var fallback",
                exc_info=True,
            )
        return instance

    @property
    def public_url(self) -> str:
        """Always use production WebSocket for real market data."""
        return self.PUBLIC_URL

    @property
    def private_url(self) -> str:
        """Always use production WebSocket for real account data."""
        return self.PRIVATE_URL

    async def connect_public(self) -> None:
        """Connect to public WebSocket for market data."""
        self.public_ws = WsPublicAsync(self.public_url)
        await self.public_ws.start()
        logger.info("Connected to OKX public WebSocket")

    async def connect_private(self) -> None:
        """Connect to private WebSocket for account/order updates."""
        if not self.api_key or not self.secret_key or not self.passphrase:
            raise ConnectionError("OKX credentials are not configured for private websocket access")
        self.private_ws = WsPrivateAsync(
            self.api_key, self.passphrase, self.secret_key, self.private_url
        )
        await self.private_ws.start()
        logger.info("Connected to OKX private WebSocket")

    async def disconnect(self) -> None:
        """Disconnect from WebSocket connections."""
        self._running = False
        if self.public_ws:
            await self.public_ws.stop()
            self.public_ws = None
        if self.private_ws:
            await self.private_ws.stop()
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

    def _public_message_handler(self, message: str) -> None:
        """Parse and dispatch public WebSocket messages to registered callbacks."""
        try:
            data = json.loads(message)
            if data.get("event") in ("subscribe", "error"):
                return
            channel = data.get("arg", {}).get("channel", "")
            if channel:
                asyncio.ensure_future(self._dispatch(channel, data))
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON from public WS: {message}")
        except Exception as e:
            logger.error(f"Error processing public message: {e}")

    def _private_message_handler(self, message: str) -> None:
        """Parse and dispatch private WebSocket messages to registered callbacks."""
        try:
            data = json.loads(message)
            if data.get("event") in ("login", "subscribe", "error"):
                return
            channel = data.get("arg", {}).get("channel", "")
            if channel:
                asyncio.ensure_future(self._dispatch(channel, data))
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON from private WS: {message}")
        except Exception as e:
            logger.error(f"Error processing private message: {e}")

    # Public Subscriptions
    async def subscribe_ticker(self, inst_id: str) -> None:
        """Subscribe to ticker updates for an instrument."""
        if not self.public_ws:
            await self.connect_public()
        await self.public_ws.subscribe(
            [{"channel": "tickers", "instId": inst_id}], self._public_message_handler
        )
        logger.info(f"Subscribed to ticker: {inst_id}")

    async def subscribe_orderbook(self, inst_id: str, depth: str = "books5") -> None:
        """Subscribe to orderbook updates.

        Args:
            inst_id: Instrument ID
            depth: "books5" (top 5) or "books" (full depth) or "books50-l2-tbt"
        """
        if not self.public_ws:
            await self.connect_public()
        await self.public_ws.subscribe(
            [{"channel": depth, "instId": inst_id}], self._public_message_handler
        )
        logger.info(f"Subscribed to orderbook: {inst_id}")

    async def subscribe_trades(self, inst_id: str) -> None:
        """Subscribe to trade updates for an instrument."""
        if not self.public_ws:
            await self.connect_public()
        await self.public_ws.subscribe(
            [{"channel": "trades", "instId": inst_id}], self._public_message_handler
        )
        logger.info(f"Subscribed to trades: {inst_id}")

    async def subscribe_candlesticks(self, inst_id: str, bar: str = "1m") -> None:
        """Subscribe to candlestick updates.

        Args:
            inst_id: Instrument ID
            bar: Candle interval (1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M)
        """
        if not self.public_ws:
            await self.connect_public()
        await self.public_ws.subscribe(
            [{"channel": f"candle{bar}", "instId": inst_id}],
            self._public_message_handler,
        )
        logger.info(f"Subscribed to candles: {inst_id} {bar}")

    # Private Subscriptions
    async def subscribe_orders(self, inst_type: str = "SPOT") -> None:
        """Subscribe to order updates."""
        if not self.private_ws:
            await self.connect_private()
        await self.private_ws.subscribe(
            [{"channel": "orders", "instType": inst_type}],
            self._private_message_handler,
        )
        logger.info(f"Subscribed to orders: {inst_type}")

    async def subscribe_positions(self, inst_type: str = "SPOT") -> None:
        """Subscribe to position updates."""
        if not self.private_ws:
            await self.connect_private()
        await self.private_ws.subscribe(
            [{"channel": "positions", "instType": inst_type}],
            self._private_message_handler,
        )
        logger.info(f"Subscribed to positions: {inst_type}")

    async def subscribe_account(self) -> None:
        """Subscribe to account balance updates."""
        if not self.private_ws:
            await self.connect_private()
        await self.private_ws.subscribe([{"channel": "account"}], self._private_message_handler)
        logger.info("Subscribed to account updates")

    async def start(self) -> None:
        """Mark as running. SDK manages internal consume loops via start()."""
        self._running = True
        logger.info("OKX WebSocket listeners started")

    async def wait(self) -> None:
        """Wait while running."""
        while self._running:
            await asyncio.sleep(1)
