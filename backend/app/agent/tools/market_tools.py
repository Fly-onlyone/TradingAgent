"""Market data tools for the trading agent."""

import asyncio
from typing import Any

from app.exchange.okx_client import OKXClient


async def get_ticker(symbol: str) -> dict[str, Any]:
    """Get current ticker data for a symbol.

    Args:
        symbol: Trading pair (e.g., BTC-USDT)

    Returns:
        Ticker data including price, volume, and 24h changes
    """
    client = await OKXClient.create()
    result = await asyncio.wait_for(client.get_ticker(symbol.upper()), timeout=10.0)

    if result.get("code") != "0" or not result.get("data"):
        return {"error": f"Failed to get ticker for {symbol}"}

    data = result["data"][0]
    last_price = float(data.get("last", 0))
    open_24h = float(data.get("open24h", 0))
    change_24h = last_price - open_24h if open_24h else 0
    change_pct = (change_24h / open_24h * 100) if open_24h else 0

    return {
        "symbol": symbol.upper(),
        "last_price": last_price,
        "bid_price": float(data.get("bidPx", 0)),
        "ask_price": float(data.get("askPx", 0)),
        "volume_24h": float(data.get("vol24h", 0)),
        "high_24h": float(data.get("high24h", 0)),
        "low_24h": float(data.get("low24h", 0)),
        "change_24h": change_24h,
        "change_pct_24h": round(change_pct, 2),
    }


async def get_orderbook(symbol: str, depth: int = 20) -> dict[str, Any]:
    """Get order book for a symbol.

    Args:
        symbol: Trading pair (e.g., BTC-USDT)
        depth: Number of levels to retrieve

    Returns:
        Order book with bids and asks
    """
    client = await OKXClient.create()
    result = await asyncio.wait_for(
        client.get_orderbook(symbol.upper(), depth), timeout=10.0
    )

    if result.get("code") != "0" or not result.get("data"):
        return {"error": f"Failed to get orderbook for {symbol}"}

    data = result["data"][0]

    # Parse bids and asks (format: [price, size, 0, num_orders])
    bids = [{"price": float(b[0]), "size": float(b[1])} for b in data.get("bids", [])]
    asks = [{"price": float(a[0]), "size": float(a[1])} for a in data.get("asks", [])]

    # Calculate spread
    if bids and asks:
        spread = asks[0]["price"] - bids[0]["price"]
        spread_pct = (spread / asks[0]["price"]) * 100
    else:
        spread = 0
        spread_pct = 0

    return {
        "symbol": symbol.upper(),
        "bids": bids[:depth],
        "asks": asks[:depth],
        "spread": spread,
        "spread_pct": round(spread_pct, 4),
        "bid_volume": sum(b["size"] for b in bids),
        "ask_volume": sum(a["size"] for a in asks),
    }


async def get_candlesticks(
    symbol: str,
    timeframe: str = "1H",
    limit: int = 100,
) -> dict[str, Any]:
    """Get OHLCV candlestick data.

    Args:
        symbol: Trading pair (e.g., BTC-USDT)
        timeframe: Candle interval (1m, 5m, 15m, 30m, 1H, 4H, 1D)
        limit: Number of candles to retrieve

    Returns:
        List of OHLCV candles
    """
    client = await OKXClient.create()
    result = await asyncio.wait_for(
        client.get_candlesticks(symbol.upper(), timeframe, limit), timeout=10.0
    )

    if result.get("code") != "0" or not result.get("data"):
        return {"error": f"Failed to get candlesticks for {symbol}"}

    # Parse candles (format: [timestamp, open, high, low, close, vol, volCcy, volCcyQuote, confirm])
    candles = []
    for c in result["data"]:
        candles.append(
            {
                "timestamp": int(c[0]),
                "open": float(c[1]),
                "high": float(c[2]),
                "low": float(c[3]),
                "close": float(c[4]),
                "volume": float(c[5]),
                "quote_volume": float(c[7]) if len(c) > 7 else None,
            }
        )

    candles.reverse()

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "candles": candles,
        "count": len(candles),
    }
