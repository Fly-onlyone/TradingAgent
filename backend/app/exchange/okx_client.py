"""OKX REST API client for trading operations."""

import base64
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class OKXClient:
    """OKX REST API client for account and trading operations."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = "https://www.okx.com"
        self.api_key = self.settings.okx_api_key
        self.secret_key = self.settings.okx_secret_key
        self.passphrase = self.settings.okx_passphrase
        self.sandbox = self.settings.okx_sandbox

    @classmethod
    async def create(cls) -> "OKXClient":
        """Create client with DB settings (fallback to env vars)."""
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
                "Failed to load OKX credentials from AppSettings — using env var fallback",
                exc_info=True,
            )
        return instance

    def _get_timestamp(self) -> str:
        """Get ISO 8601 timestamp for API requests."""
        return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    def _sign(self, timestamp: str, method: str, path: str, body: str = "") -> str:
        """Create HMAC-SHA256 signature for authenticated requests."""
        message = timestamp + method.upper() + path + body
        mac = hmac.new(
            self.secret_key.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        )
        return base64.b64encode(mac.digest()).decode("utf-8")

    def _get_headers(self, method: str, path: str, body: str = "") -> dict[str, str]:
        """Get headers for authenticated requests."""
        timestamp = self._get_timestamp()
        signature = self._sign(timestamp, method, path, body)

        headers = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": signature,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
        }

        if self.sandbox:
            headers["x-simulated-trading"] = "1"

        return headers

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make authenticated request to OKX API."""
        url = self.base_url + path

        body_str = ""
        if body:
            body_str = json.dumps(body)

        if params:
            query_string = "&".join(f"{k}={v}" for k, v in params.items())
            path = f"{path}?{query_string}"

        headers = self._get_headers(method, path, body_str)

        async with httpx.AsyncClient() as client:
            if method.upper() == "GET":
                response = await client.get(url, params=params, headers=headers)
            elif method.upper() == "POST":
                response = await client.post(url, content=body_str, headers=headers)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()

    # Account Endpoints
    async def get_account_balance(self) -> dict[str, Any]:
        """Get account balance information."""
        result = await self._request("GET", "/api/v5/account/balance")
        return result

    async def get_positions(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get current positions."""
        result = await self._request(
            "GET",
            "/api/v5/account/positions",
            params={"instType": inst_type},
        )
        return result

    async def get_account_config(self) -> dict[str, Any]:
        """Get account configuration."""
        result = await self._request("GET", "/api/v5/account/config")
        return result

    # Trading Endpoints
    async def place_order(
        self,
        inst_id: str,
        side: str,
        order_type: str,
        size: Decimal,
        price: Decimal | None = None,
        client_order_id: str | None = None,
        reduce_only: bool = False,
    ) -> dict[str, Any]:
        """Place a new order.

        Args:
            inst_id: Instrument ID (e.g., "BTC-USDT")
            side: "buy" or "sell"
            order_type: "market", "limit", "post_only", etc.
            size: Order quantity
            price: Price for limit orders
            client_order_id: Custom order ID
            reduce_only: Whether to reduce position only
        """
        body: dict[str, Any] = {
            "instId": inst_id,
            "tdMode": "cash",  # cash for spot, cross/isolated for margin
            "side": side,
            "ordType": order_type,
            "sz": str(size),
        }

        if price is not None:
            body["px"] = str(price)
        if client_order_id:
            body["clOrdId"] = client_order_id
        if reduce_only:
            body["reduceOnly"] = True

        result = await self._request("POST", "/api/v5/trade/order", body=body)
        return result

    async def cancel_order(
        self,
        inst_id: str,
        order_id: str | None = None,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        """Cancel an order by order ID or client order ID."""
        body: dict[str, Any] = {"instId": inst_id}

        if order_id:
            body["ordId"] = order_id
        elif client_order_id:
            body["clOrdId"] = client_order_id
        else:
            raise ValueError("Either order_id or client_order_id must be provided")

        result = await self._request("POST", "/api/v5/trade/cancel-order", body=body)
        return result

    async def get_order(
        self,
        inst_id: str,
        order_id: str | None = None,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        """Get order details."""
        params: dict[str, Any] = {"instId": inst_id}

        if order_id:
            params["ordId"] = order_id
        elif client_order_id:
            params["clOrdId"] = client_order_id

        result = await self._request("GET", "/api/v5/trade/order", params=params)
        return result

    async def get_open_orders(
        self,
        inst_type: str = "SPOT",
        inst_id: str | None = None,
    ) -> dict[str, Any]:
        """Get list of open orders."""
        params: dict[str, Any] = {"instType": inst_type}
        if inst_id:
            params["instId"] = inst_id

        result = await self._request(
            "GET", "/api/v5/trade/orders-pending", params=params
        )
        return result

    async def get_order_history(
        self,
        inst_type: str = "SPOT",
        inst_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Get order history."""
        params: dict[str, Any] = {"instType": inst_type, "limit": str(limit)}
        if inst_id:
            params["instId"] = inst_id

        result = await self._request(
            "GET", "/api/v5/trade/orders-history", params=params
        )
        return result

    # Market Data Endpoints (Public - no auth needed)
    async def get_ticker(self, inst_id: str) -> dict[str, Any]:
        """Get ticker information for an instrument."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v5/market/ticker",
                params={"instId": inst_id},
            )
            response.raise_for_status()
            return response.json()

    async def get_tickers(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get all tickers for an instrument type."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v5/market/tickers",
                params={"instType": inst_type},
            )
            response.raise_for_status()
            return response.json()

    async def get_orderbook(self, inst_id: str, depth: int = 20) -> dict[str, Any]:
        """Get orderbook for an instrument."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v5/market/books",
                params={"instId": inst_id, "sz": str(depth)},
            )
            response.raise_for_status()
            return response.json()

    async def get_candlesticks(
        self,
        inst_id: str,
        bar: str = "1H",
        limit: int = 100,
        before: str | None = None,
        after: str | None = None,
    ) -> dict[str, Any]:
        """Get candlestick (OHLCV) data.

        Args:
            inst_id: Instrument ID
            bar: Bar size (1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M)
            limit: Number of candles (max 300)
            before: Pagination - timestamp before
            after: Pagination - timestamp after
        """
        params: dict[str, Any] = {"instId": inst_id, "bar": bar, "limit": str(limit)}
        if before:
            params["before"] = before
        if after:
            params["after"] = after

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v5/market/candles",
                params=params,
            )
            response.raise_for_status()
            return response.json()

    async def get_instruments(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get available trading instruments."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v5/public/instruments",
                params={"instType": inst_type},
            )
            response.raise_for_status()
            return response.json()
