"""Fundamental analysis tools for the trading agent."""

from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()


async def get_onchain_metrics(symbol: str) -> dict[str, Any]:
    """Get on-chain metrics for crypto assets.

    Args:
        symbol: Crypto asset symbol (e.g., BTC, ETH)

    Returns:
        On-chain metrics including exchange flows, whale activity, etc.
    """
    # Normalize symbol (remove -USDT suffix if present)
    asset = symbol.upper().replace("-USDT", "").replace("-USD", "")

    # In production, this would call Glassnode, CryptoQuant, or similar APIs
    # For now, return placeholder structure showing what data would be available

    # Try to get some data from CoinGecko (free API)
    try:
        async with httpx.AsyncClient() as client:
            # Get coin data from CoinGecko
            coin_id = asset.lower()
            if coin_id == "btc":
                coin_id = "bitcoin"
            elif coin_id == "eth":
                coin_id = "ethereum"

            response = await client.get(
                f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                params={
                    "localization": "false",
                    "tickers": "false",
                    "community_data": "true",
                },
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                market_data = data.get("market_data", {})

                return {
                    "symbol": asset,
                    "metrics": {
                        # Market metrics (from CoinGecko)
                        "market_cap": market_data.get("market_cap", {}).get("usd"),
                        "market_cap_rank": data.get("market_cap_rank"),
                        "total_volume_24h": market_data.get("total_volume", {}).get("usd"),
                        "price_change_24h_pct": market_data.get("price_change_percentage_24h"),
                        "price_change_7d_pct": market_data.get("price_change_percentage_7d"),
                        "price_change_30d_pct": market_data.get("price_change_percentage_30d"),
                        # Supply metrics
                        "circulating_supply": market_data.get("circulating_supply"),
                        "total_supply": market_data.get("total_supply"),
                        "max_supply": market_data.get("max_supply"),
                        # ATH/ATL
                        "ath": market_data.get("ath", {}).get("usd"),
                        "ath_change_pct": market_data.get("ath_change_percentage", {}).get("usd"),
                        "atl": market_data.get("atl", {}).get("usd"),
                        # Development activity
                        "github_forks": data.get("developer_data", {}).get("forks"),
                        "github_stars": data.get("developer_data", {}).get("stars"),
                        "github_commits_4w": data.get("developer_data", {}).get(
                            "commit_count_4_weeks"
                        ),
                        # Community
                        "twitter_followers": data.get("community_data", {}).get(
                            "twitter_followers"
                        ),
                        "reddit_subscribers": data.get("community_data", {}).get(
                            "reddit_subscribers"
                        ),
                    },
                    "note": "On-chain metrics (exchange flows, whale activity) require premium API access",
                }
    except Exception:
        pass

    return {
        "symbol": asset,
        "metrics": {
            "active_addresses": None,
            "transaction_volume": None,
            "exchange_inflow": None,
            "exchange_outflow": None,
            "whale_transactions": None,
            "nvt_ratio": None,
            "mvrv_ratio": None,
            "funding_rate": None,
            "open_interest": None,
        },
        "note": "Full on-chain metrics require Glassnode/CryptoQuant API keys",
    }


async def get_project_fundamentals(symbol: str) -> dict[str, Any]:
    """Get project fundamentals and tokenomics.

    Args:
        symbol: Crypto asset symbol

    Returns:
        Project fundamentals including TVL, revenue, tokenomics
    """
    asset = symbol.upper().replace("-USDT", "").replace("-USD", "")

    fundamentals = {
        "symbol": asset,
        "tokenomics": {},
        "defi_metrics": {},
        "project_info": {},
    }

    # Try CoinGecko for basic info
    try:
        async with httpx.AsyncClient() as client:
            coin_id = asset.lower()
            if coin_id == "btc":
                coin_id = "bitcoin"
            elif coin_id == "eth":
                coin_id = "ethereum"

            response = await client.get(
                f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                params={"localization": "false"},
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                market_data = data.get("market_data", {})

                fundamentals["tokenomics"] = {
                    "market_cap": market_data.get("market_cap", {}).get("usd"),
                    "fully_diluted_valuation": market_data.get("fully_diluted_valuation", {}).get(
                        "usd"
                    ),
                    "circulating_supply": market_data.get("circulating_supply"),
                    "max_supply": market_data.get("max_supply"),
                    "total_supply": market_data.get("total_supply"),
                }

                fundamentals["project_info"] = {
                    "name": data.get("name"),
                    "categories": data.get("categories", []),
                    "description": (
                        data.get("description", {}).get("en", "")[:500]
                        if data.get("description")
                        else None
                    ),
                    "homepage": data.get("links", {}).get("homepage", [None])[0],
                    "github": data.get("links", {}).get("repos_url", {}).get("github", []),
                }
    except Exception:
        pass

    # Try DefiLlama for DeFi protocols
    try:
        async with httpx.AsyncClient() as client:
            # DefiLlama protocol lookup
            response = await client.get(
                f"{settings.defillama_api_url}/protocol/{asset.lower()}",
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                fundamentals["defi_metrics"] = {
                    "tvl": data.get("tvl"),
                    "tvl_change_1d": data.get("change_1d"),
                    "tvl_change_7d": data.get("change_7d"),
                    "category": data.get("category"),
                    "chains": data.get("chains", []),
                }
    except Exception:
        pass

    return fundamentals


async def get_macro_indicators() -> dict[str, Any]:
    """Get macro economic indicators.

    Returns:
        Macro indicators including BTC dominance, fear/greed index, etc.
    """
    indicators = {
        "crypto_market": {},
        "fear_greed": {},
        "correlations": {},
    }

    # Get crypto market data from CoinGecko
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/global",
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json().get("data", {})
                indicators["crypto_market"] = {
                    "total_market_cap_usd": data.get("total_market_cap", {}).get("usd"),
                    "total_volume_24h_usd": data.get("total_volume", {}).get("usd"),
                    "btc_dominance": data.get("market_cap_percentage", {}).get("btc"),
                    "eth_dominance": data.get("market_cap_percentage", {}).get("eth"),
                    "market_cap_change_24h_pct": data.get("market_cap_change_percentage_24h_usd"),
                    "active_cryptocurrencies": data.get("active_cryptocurrencies"),
                }
    except Exception:
        pass

    # Get Fear & Greed Index
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.alternative.me/fng/",
                params={"limit": 1},
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json().get("data", [{}])[0]
                value = int(data.get("value", 50))

                # Interpret the value
                if value <= 25:
                    classification = "Extreme Fear"
                    signal = "potential_buy"
                elif value <= 45:
                    classification = "Fear"
                    signal = "cautious_buy"
                elif value <= 55:
                    classification = "Neutral"
                    signal = "neutral"
                elif value <= 75:
                    classification = "Greed"
                    signal = "cautious_sell"
                else:
                    classification = "Extreme Greed"
                    signal = "potential_sell"

                indicators["fear_greed"] = {
                    "value": value,
                    "classification": classification,
                    "signal": signal,
                    "timestamp": data.get("timestamp"),
                }
    except Exception:
        pass

    # Correlation placeholders (would need external data)
    indicators["correlations"] = {
        "btc_sp500": None,
        "btc_gold": None,
        "btc_dxy": None,
        "note": "Correlation data requires additional market data sources",
    }

    return indicators
