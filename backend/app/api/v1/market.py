"""Market data endpoints using Beanie ODM."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.db.models.user import User
from app.db.models.market import MarketData
from app.api.v1.auth import get_current_active_user
from app.exchange.okx_client import OKXClient

router = APIRouter()


class OHLCVResponse(BaseModel):
    """OHLCV data response schema."""

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: Optional[float]

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


class MarketOverviewResponse(BaseModel):
    """Market overview response schema."""

    total_volume_24h: float
    btc_dominance: Optional[float]
    eth_dominance: Optional[float]
    top_gainers: list[dict]
    top_losers: list[dict]
    most_traded: list[dict]


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
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
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
    client = OKXClient()
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
    symbols: Optional[str] = None,  # Comma-separated list
    current_user: User = Depends(get_current_active_user),
) -> list[TickerResponse]:
    """Get ticker data for multiple symbols."""
    symbol_list = symbols.split(",") if symbols else ["BTC-USDT", "ETH-USDT"]
    client = OKXClient()

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


@router.get("/overview", response_model=MarketOverviewResponse)
async def get_market_overview(
    current_user: User = Depends(get_current_active_user),
) -> MarketOverviewResponse:
    """Get overall market overview with top movers."""
    # TODO: Fetch from OKX and external data sources for dominance

    return MarketOverviewResponse(
        total_volume_24h=0.0,
        btc_dominance=None,
        eth_dominance=None,
        top_gainers=[],
        top_losers=[],
        most_traded=[],
    )


@router.get("/symbols")
async def list_symbols(
    quote_currency: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List available trading symbols from OKX."""
    client = OKXClient()

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
