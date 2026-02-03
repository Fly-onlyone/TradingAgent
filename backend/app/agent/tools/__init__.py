"""Agent tools module."""

from app.agent.tools.market_tools import (
    get_ticker,
    get_orderbook,
    get_candlesticks,
)
from app.agent.tools.trading_tools import (
    place_order,
    cancel_order,
    get_open_orders,
    get_account_balance,
)
from app.agent.tools.technical_tools import (
    get_technical_indicators,
    detect_chart_patterns,
    get_price_action,
)
from app.agent.tools.fundamental_tools import (
    get_onchain_metrics,
    get_project_fundamentals,
    get_macro_indicators,
)
from app.agent.tools.knowledge_tools import (
    search_strategies,
    search_lessons,
    search_patterns,
)
from app.agent.tools.news_tools import (
    get_latest_news,
    get_news_sentiment,
    search_news,
)

__all__ = [
    # Market tools
    "get_ticker",
    "get_orderbook",
    "get_candlesticks",
    # Trading tools
    "place_order",
    "cancel_order",
    "get_open_orders",
    "get_account_balance",
    # Technical tools
    "get_technical_indicators",
    "detect_chart_patterns",
    "get_price_action",
    # Fundamental tools
    "get_onchain_metrics",
    "get_project_fundamentals",
    "get_macro_indicators",
    # Knowledge tools
    "search_strategies",
    "search_lessons",
    "search_patterns",
    # News tools
    "get_latest_news",
    "get_news_sentiment",
    "search_news",
]
