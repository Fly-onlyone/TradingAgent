"""Market data endpoints using Beanie ODM."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.market import MarketData
from app.db.models.user import User
from app.exchange.okx_client import OKXClient

logger = logging.getLogger(__name__)

router = APIRouter()


class OHLCVResponse(BaseModel):
    """OHLCV data response schema."""

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
    """Current ticker response schema."""

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
    """Account balance response schema."""

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
    """Market overview response schema."""

    total_volume_24h: float
    top_gainers: list[MarketOverviewTickerResponse]
    top_losers: list[MarketOverviewTickerResponse]
    most_traded: list[MarketOverviewTickerResponse]
    error: str | None = None


def ohlcv_to_response(data: MarketData) -> OHLCVResponse:
    """Convert MarketData document to response schema."""
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

    # Return in chronological order
    return [ohlcv_to_response(d) for d in reversed(data)]


@router.get("/ticker/{symbol}", response_model=TickerResponse)
async def get_ticker(
    symbol: str,
    current_user: User = Depends(get_current_active_user),
) -> TickerResponse:
    """Get current ticker data for a symbol from OKX."""
    client = await OKXClient.create()
    result = await client.get_ticker(symbol.upper())

    if result.get("code") != "0" or not result.get("data"):
        # Return placeholder if API fails
        return TickerResponse(
            symbol=symbol.upper(),
            last_price=0.0,
            bid_price=0.0,
            ask_price=0.0,
            volume_24h=0.0,
            high_24h=0.0,
            low_24h=0.0,
            change_24h=0.0,
            change_pct_24h=0.0,
            timestamp=datetime.utcnow(),
        )

    data = result["data"][0]
    last_price = float(data.get("last", 0))
    open_24h = float(data.get("open24h", 0))
    change_24h = last_price - open_24h if open_24h else 0
    change_pct = (change_24h / open_24h * 100) if open_24h else 0

    return TickerResponse(
        symbol=symbol.upper(),
        last_price=last_price,
        bid_price=float(data.get("bidPx", 0)),
        ask_price=float(data.get("askPx", 0)),
        volume_24h=float(data.get("vol24h", 0)),
        high_24h=float(data.get("high24h", 0)),
        low_24h=float(data.get("low24h", 0)),
        change_24h=change_24h,
        change_pct_24h=change_pct,
        timestamp=datetime.utcnow(),
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
                last_price = float(data.get("last", 0))
                open_24h = float(data.get("open24h", 0))
                change_24h = last_price - open_24h if open_24h else 0
                change_pct = (change_24h / open_24h * 100) if open_24h else 0

                tickers.append(
                    TickerResponse(
                        symbol=symbol.upper(),
                        last_price=last_price,
                        bid_price=float(data.get("bidPx", 0)),
                        ask_price=float(data.get("askPx", 0)),
                        volume_24h=float(data.get("vol24h", 0)),
                        high_24h=float(data.get("high24h", 0)),
                        low_24h=float(data.get("low24h", 0)),
                        change_24h=change_24h,
                        change_pct_24h=change_pct,
                        timestamp=datetime.utcnow(),
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
                eq = float(detail.get("eq", 0))
                if eq > 0:
                    currencies.append(
                        CurrencyBalance(
                            currency=detail.get("ccy", ""),
                            equity=eq,
                            available=float(detail.get("availBal", 0)),
                            frozen=float(detail.get("frozenBal", 0)),
                            upl=float(detail.get("upl", 0)),
                        )
                    )
            return AccountBalanceResponse(
                total_equity=float(data.get("totalEq", 0)),
                available_balance=float(data.get("adjEq", 0) or data.get("totalEq", 0)),
                unrealized_pnl=float(data.get("upl", 0)),
                margin_ratio=(
                    float(data.get("mgnRatio", 0)) if data.get("mgnRatio") else None
                ),
                currencies=currencies,
            )
    except Exception as exc:
        logger.warning("Failed to fetch account balance from OKX: %s", exc)

    return AccountBalanceResponse(
        total_equity=0.0,
        available_balance=0.0,
        unrealized_pnl=0.0,
        margin_ratio=None,
        currencies=[],
        error="Unable to fetch account balance. Check your OKX API key configuration in Settings.",
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
                last = float(item.get("last", 0))
                open_24h = float(item.get("open24h", 0))
                vol_ccy = float(item.get("volCcy24h", 0))
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

            top_gainers = sorted(tickers, key=lambda t: t.change_pct_24h, reverse=True)[
                :5
            ]
            top_losers = sorted(tickers, key=lambda t: t.change_pct_24h)[:5]
            most_traded = sorted(tickers, key=lambda t: t.volume_24h, reverse=True)[:5]

            return MarketOverviewResponse(
                total_volume_24h=total_volume,
                top_gainers=top_gainers,
                top_losers=top_losers,
                most_traded=most_traded,
            )
    except Exception as exc:
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
