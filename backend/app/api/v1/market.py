"""Market data endpoints using Beanie ODM."""

import logging
from datetime import UTC, datetime

import sentry_sdk
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.market import MarketData
from app.db.models.user import User
from app.exchange.okx_client import OKXClient
from app.utils.converters import to_float as _to_float
from app.utils.converters import to_optional_float as _to_optional_float

logger = logging.getLogger(__name__)

router = APIRouter()


class OHLCVResponse(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float | None

    class Config:
        from_attributes = True


class TickerResponse(BaseModel):
    symbol: str
    last_price: float
    bid_price: float
    ask_price: float
    volume_24h: float
    high_24h: float
    low_24h: float
    change_24h: float
    change_pct_24h: float
    timestamp: datetime


class CurrencyBalance(BaseModel):
    """Per-currency balance details."""

    currency: str
    equity: float
    available: float
    frozen: float
    upl: float


class AccountBalanceResponse(BaseModel):
    total_equity: float
    available_balance: float
    unrealized_pnl: float
    margin_ratio: float | None
    currencies: list[CurrencyBalance]
    error: str | None = None


class MarketOverviewTickerResponse(BaseModel):
    """Single ticker in market overview."""

    symbol: str
    last_price: float
    change_pct_24h: float
    volume_24h: float


class MarketOverviewResponse(BaseModel):
    total_volume_24h: float
    top_gainers: list[MarketOverviewTickerResponse]
    top_losers: list[MarketOverviewTickerResponse]
    most_traded: list[MarketOverviewTickerResponse]
    error: str | None = None


def ohlcv_to_response(data: MarketData) -> OHLCVResponse:
    return OHLCVResponse(
        timestamp=data.timestamp,
        open=data.open,
        high=data.high,
        low=data.low,
        close=data.close,
        volume=data.volume,
        quote_volume=data.quote_volume,
    )


@router.get("/ohlcv/{symbol}", response_model=list[OHLCVResponse])
async def get_ohlcv(
    symbol: str,
    timeframe: str = Query("1H", pattern="^(1m|5m|15m|30m|1H|4H|1D|1W)$"),
    limit: int = Query(100, ge=1, le=1000),
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
) -> list[OHLCVResponse]:
    """Get OHLCV candlestick data for a symbol."""
    query = MarketData.find(
        MarketData.symbol == symbol.upper(),
        MarketData.timeframe == timeframe,
    )

    if start_time:
        query = query.find(MarketData.timestamp >= start_time)
    if end_time:
        query = query.find(MarketData.timestamp <= end_time)

    data = await query.sort(-MarketData.timestamp).limit(limit).to_list()

    return [ohlcv_to_response(d) for d in reversed(data)]


@router.get("/ticker/{symbol}", response_model=TickerResponse)
async def get_ticker(
    symbol: str,
    current_user: User = Depends(get_current_active_user),
) -> TickerResponse:
    """Get current ticker data for a symbol from OKX."""
    symbol_normalized = symbol.upper()

    try:
        client = await OKXClient.create()
        result = await client.get_ticker(symbol_normalized)
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.warning("Failed to fetch ticker %s from OKX: %s", symbol_normalized, exc)
        result = {"code": "error", "data": []}

    if result.get("code") != "0" or not result.get("data"):
        return TickerResponse(
            symbol=symbol_normalized,
            last_price=0.0,
            bid_price=0.0,
            ask_price=0.0,
            volume_24h=0.0,
            high_24h=0.0,
            low_24h=0.0,
            change_24h=0.0,
            change_pct_24h=0.0,
            timestamp=datetime.now(UTC),
        )

    data = result["data"][0]
    last_price = _to_float(data.get("last"))
    open_24h = _to_float(data.get("open24h"))
    change_24h = last_price - open_24h if open_24h else 0
    change_pct = (change_24h / open_24h * 100) if open_24h else 0

    return TickerResponse(
        symbol=symbol_normalized,
        last_price=last_price,
        bid_price=_to_float(data.get("bidPx")),
        ask_price=_to_float(data.get("askPx")),
        volume_24h=_to_float(data.get("vol24h")),
        high_24h=_to_float(data.get("high24h")),
        low_24h=_to_float(data.get("low24h")),
        change_24h=change_24h,
        change_pct_24h=change_pct,
        timestamp=datetime.now(UTC),
    )


@router.get("/tickers", response_model=list[TickerResponse])
async def get_tickers(
    symbols: str | None = None,  # Comma-separated list
    current_user: User = Depends(get_current_active_user),
) -> list[TickerResponse]:
    """Get ticker data for multiple symbols."""
    symbol_list = symbols.split(",") if symbols else ["BTC-USDT", "ETH-USDT"]
    client = await OKXClient.create()

    tickers = []
    for symbol in symbol_list:
        try:
            result = await client.get_ticker(symbol.upper())
            if result.get("code") == "0" and result.get("data"):
                data = result["data"][0]
                last_price = _to_float(data.get("last"))
                open_24h = _to_float(data.get("open24h"))
                change_24h = last_price - open_24h if open_24h else 0
                change_pct = (change_24h / open_24h * 100) if open_24h else 0

                tickers.append(
                    TickerResponse(
                        symbol=symbol.upper(),
                        last_price=last_price,
                        bid_price=_to_float(data.get("bidPx")),
                        ask_price=_to_float(data.get("askPx")),
                        volume_24h=_to_float(data.get("vol24h")),
                        high_24h=_to_float(data.get("high24h")),
                        low_24h=_to_float(data.get("low24h")),
                        change_24h=change_24h,
                        change_pct_24h=change_pct,
                        timestamp=datetime.now(UTC),
                    )
                )
        except Exception:
            # Skip failed symbols
            continue

    return tickers


@router.get("/account", response_model=AccountBalanceResponse)
async def get_account_balance(
    current_user: User = Depends(get_current_active_user),
) -> AccountBalanceResponse:
    """Get account balance from OKX."""
    client = await OKXClient.create()
    try:
        result = await client.get_account_balance()
        if result.get("code") == "0" and result.get("data"):
            data = result["data"][0]
            currencies = []
            for detail in data.get("details", []):
                eq = _to_float(detail.get("eq"))
                if eq > 0:
                    currencies.append(
                        CurrencyBalance(
                            currency=detail.get("ccy", ""),
                            equity=eq,
                            available=_to_float(detail.get("availBal")),
                            frozen=_to_float(detail.get("frozenBal")),
                            upl=_to_float(detail.get("upl")),
                        )
                    )
            total_equity = _to_float(data.get("totalEq"))
            available_balance = _to_optional_float(data.get("adjEq"))
            return AccountBalanceResponse(
                total_equity=total_equity,
                available_balance=(
                    available_balance if available_balance is not None else total_equity
                ),
                unrealized_pnl=_to_float(data.get("upl")),
                margin_ratio=_to_optional_float(data.get("mgnRatio")),
                currencies=currencies,
            )
        code = str(result.get("code", "unknown"))
        message = str(result.get("msg", "Unknown error from OKX"))
        sandbox_hint = (
            " Sandbox Mode is enabled; use OKX demo API credentials or disable "
            "Sandbox Mode in Settings for production credentials."
            if client.sandbox
            else ""
        )
        logger.warning(
            "OKX account balance request failed: code=%s msg=%s sandbox=%s",
            code,
            message,
            client.sandbox,
        )
        return AccountBalanceResponse(
            total_equity=0.0,
            available_balance=0.0,
            unrealized_pnl=0.0,
            margin_ratio=None,
            currencies=[],
            error=f"OKX API error ({code}): {message}.{sandbox_hint}",
        )
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.warning("Failed to fetch account balance from OKX: %s", exc)
        sandbox_hint = (
            " Sandbox Mode is enabled; use OKX demo API credentials or disable "
            "Sandbox Mode in Settings for production credentials."
            if client.sandbox
            else ""
        )
        return AccountBalanceResponse(
            total_equity=0.0,
            available_balance=0.0,
            unrealized_pnl=0.0,
            margin_ratio=None,
            currencies=[],
            error=f"Unable to fetch account balance from OKX: {exc}.{sandbox_hint}",
        )


@router.get("/overview", response_model=MarketOverviewResponse)
async def get_market_overview(
    current_user: User = Depends(get_current_active_user),
) -> MarketOverviewResponse:
    """Get overall market overview with top movers from OKX."""
    client = await OKXClient.create()
    try:
        result = await client.get_tickers("SPOT")
        if result.get("code") == "0" and result.get("data"):
            tickers = []
            total_volume = 0.0
            for item in result["data"]:
                inst_id = item.get("instId", "")
                # Only include USDT pairs for cleaner overview
                if not inst_id.endswith("-USDT"):
                    continue
                last = _to_float(item.get("last"))
                open_24h = _to_float(item.get("open24h"))
                vol_ccy = _to_float(item.get("volCcy24h"))
                change_pct = ((last - open_24h) / open_24h * 100) if open_24h else 0.0
                total_volume += vol_ccy
                tickers.append(
                    MarketOverviewTickerResponse(
                        symbol=inst_id,
                        last_price=last,
                        change_pct_24h=round(change_pct, 2),
                        volume_24h=vol_ccy,
                    )
                )

            top_gainers = sorted(tickers, key=lambda t: t.change_pct_24h, reverse=True)[:5]
            top_losers = sorted(tickers, key=lambda t: t.change_pct_24h)[:5]
            most_traded = sorted(tickers, key=lambda t: t.volume_24h, reverse=True)[:5]

            return MarketOverviewResponse(
                total_volume_24h=total_volume,
                top_gainers=top_gainers,
                top_losers=top_losers,
                most_traded=most_traded,
            )
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.warning("Failed to fetch market overview from OKX: %s", exc)

    return MarketOverviewResponse(
        total_volume_24h=0.0,
        top_gainers=[],
        top_losers=[],
        most_traded=[],
        error="Unable to fetch market data from OKX.",
    )


@router.get("/symbols")
async def list_symbols(
    quote_currency: str | None = None,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List available trading symbols from OKX."""
    client = await OKXClient.create()

    try:
        result = await client.get_instruments("SPOT")
        if result.get("code") == "0" and result.get("data"):
            symbols = [
                {
                    "symbol": inst["instId"],
                    "base": inst["baseCcy"],
                    "quote": inst["quoteCcy"],
                }
                for inst in result["data"]
            ]

            if quote_currency:
                symbols = [s for s in symbols if s["quote"] == quote_currency.upper()]

            return {"symbols": symbols[:100]}  # Limit to 100 symbols
    except Exception:
        pass

    # Fallback common pairs
    symbols = [
        {"symbol": "BTC-USDT", "base": "BTC", "quote": "USDT"},
        {"symbol": "ETH-USDT", "base": "ETH", "quote": "USDT"},
        {"symbol": "SOL-USDT", "base": "SOL", "quote": "USDT"},
        {"symbol": "XRP-USDT", "base": "XRP", "quote": "USDT"},
        {"symbol": "DOGE-USDT", "base": "DOGE", "quote": "USDT"},
    ]

    if quote_currency:
        symbols = [s for s in symbols if s["quote"] == quote_currency.upper()]

    return {"symbols": symbols}
