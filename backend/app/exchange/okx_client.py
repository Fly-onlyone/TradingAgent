"""OKX REST API client for trading operations."""

import asyncio
import logging
from decimal import Decimal
from typing import Any

import okx.Account as Account
import okx.MarketData as MarketData
import okx.PublicData as PublicData
import okx.Trade as Trade

from app.config import get_settings

logger = logging.getLogger(__name__)


class OKXClient:
    """OKX REST API client for account and trading operations."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.api_key = self.settings.okx_api_key
        self.secret_key = self.settings.okx_secret_key
        self.passphrase = self.settings.okx_passphrase
        self.sandbox = self.settings.okx_sandbox
        self._trade: Trade.TradeAPI | None = None
        self._account: Account.AccountAPI | None = None
        self._market: MarketData.MarketAPI | None = None
        self._public: PublicData.PublicAPI | None = None

    def _init_sdk_clients(self) -> None:
        flag = "1" if self.sandbox else "0"
        self._trade = Trade.TradeAPI(self.api_key, self.secret_key, self.passphrase, False, flag)
        self._account = Account.AccountAPI(
            self.api_key, self.secret_key, self.passphrase, False, flag
        )
        self._market = MarketData.MarketAPI(flag=flag)
        self._public = PublicData.PublicAPI(flag=flag)

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
        instance._init_sdk_clients()
        return instance

    # Account Endpoints
    async def get_account_balance(self) -> dict[str, Any]:
        """Get account balance information."""
        return await asyncio.to_thread(self._account.get_account_balance)

    async def get_positions(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get current positions."""
        return await asyncio.to_thread(self._account.get_positions, instType=inst_type)

    async def get_account_config(self) -> dict[str, Any]:
        """Get account configuration."""
        return await asyncio.to_thread(self._account.get_account_config)

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
        return await asyncio.to_thread(
            self._trade.place_order,
            instId=inst_id,
            tdMode="cash",
            side=side,
            ordType=order_type,
            sz=str(size),
            px=str(price) if price is not None else "",
            clOrdId=client_order_id or "",
            reduceOnly=reduce_only,
        )

    async def cancel_order(
        self,
        inst_id: str,
        order_id: str | None = None,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        """Cancel an order by order ID or client order ID."""
        if not order_id and not client_order_id:
            raise ValueError("Either order_id or client_order_id must be provided")
        return await asyncio.to_thread(
            self._trade.cancel_order,
            instId=inst_id,
            ordId=order_id or "",
            clOrdId=client_order_id or "",
        )

    async def get_order(
        self,
        inst_id: str,
        order_id: str | None = None,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        """Get order details."""
        return await asyncio.to_thread(
            self._trade.get_order,
            instId=inst_id,
            ordId=order_id or "",
            clOrdId=client_order_id or "",
        )

    async def get_open_orders(
        self,
        inst_type: str = "SPOT",
        inst_id: str | None = None,
    ) -> dict[str, Any]:
        """Get list of open orders."""
        return await asyncio.to_thread(
            self._trade.get_order_list,
            instType=inst_type,
            instId=inst_id or "",
        )

    async def get_order_history(
        self,
        inst_type: str = "SPOT",
        inst_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Get order history."""
        return await asyncio.to_thread(
            self._trade.get_orders_history,
            instType=inst_type,
            instId=inst_id or "",
            limit=str(limit),
        )

    # Market Data Endpoints (Public - no auth needed)
    async def get_ticker(self, inst_id: str) -> dict[str, Any]:
        """Get ticker information for an instrument."""
        return await asyncio.to_thread(self._market.get_ticker, instId=inst_id)

    async def get_tickers(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get all tickers for an instrument type."""
        return await asyncio.to_thread(self._market.get_tickers, instType=inst_type)

    async def get_orderbook(self, inst_id: str, depth: int = 20) -> dict[str, Any]:
        """Get orderbook for an instrument."""
        return await asyncio.to_thread(self._market.get_orderbook, instId=inst_id, sz=str(depth))

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
        return await asyncio.to_thread(
            self._market.get_candlesticks,
            instId=inst_id,
            bar=bar,
            limit=str(limit),
            before=before or "",
            after=after or "",
        )

    async def get_instruments(self, inst_type: str = "SPOT") -> dict[str, Any]:
        """Get available trading instruments."""
        return await asyncio.to_thread(self._public.get_instruments, instType=inst_type)
