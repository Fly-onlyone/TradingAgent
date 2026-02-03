"""MongoDB database session management with Beanie ODM."""

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

settings = get_settings()

# Global client instance
_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    global _client, _db

    _client = AsyncIOMotorClient(settings.mongodb_url)
    _db = _client[settings.mongodb_db_name]

    # Import all document models for Beanie initialization
    from app.db.models.user import User
    from app.db.models.order import Order
    from app.db.models.strategy import Strategy
    from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
    from app.db.models.news import NewsSource, NewsArticle, CredibilityEvent
    from app.db.models.market import MarketData, Trade
    from app.db.models.agent_task import AgentTask
    from app.db.models.agent_decision import AgentDecision
    from app.db.models.agent_session import AgentSession
    from app.db.models.notification import Notification, UserNotificationSettings

    # Initialize Beanie with all document models
    await init_beanie(
        database=_db,
        document_models=[
            User,
            Order,
            Strategy,
            StrategyKnowledge,
            TradeLesson,
            TradingPattern,
            NewsSource,
            NewsArticle,
            CredibilityEvent,
            MarketData,
            Trade,
            # Agent models
            AgentTask,
            AgentDecision,
            AgentSession,
            # Notification models
            Notification,
            UserNotificationSettings,
        ],
    )


async def close_db() -> None:
    """Close MongoDB connection."""
    global _client
    if _client:
        _client.close()
        _client = None


def get_db() -> AsyncIOMotorDatabase:
    """Get database instance."""
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


def get_client() -> AsyncIOMotorClient:
    """Get MongoDB client instance."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client
