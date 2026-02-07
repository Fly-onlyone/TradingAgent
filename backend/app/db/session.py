"""MongoDB database session management with Beanie ODM."""

import asyncio
import logging
import subprocess
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ServerSelectionTimeoutError

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Global client instance
_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def _ensure_mongodb_running() -> None:
    """Try to start MongoDB if it's not reachable (Windows service)."""
    test_client = AsyncIOMotorClient(
        settings.mongodb_url, serverSelectionTimeoutMS=2000
    )
    try:
        await test_client.admin.command("ping")
        return  # Already running
    except ServerSelectionTimeoutError:
        logger.warning("MongoDB not reachable — attempting to start the service")
    finally:
        test_client.close()

    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["net", "start", "MongoDB"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode == 0:
                logger.info("MongoDB service started successfully")
                await asyncio.sleep(2)  # Give it a moment to accept connections
                return
            logger.warning("net start MongoDB failed: %s", result.stderr.strip())
        except Exception as e:
            logger.warning("Could not start MongoDB service: %s", e)

        # Fallback: try starting mongod directly
        mongod_paths = [
            r"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe",
            r"C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe",
            r"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe",
        ]
        for mongod_path in mongod_paths:
            try:
                subprocess.Popen(
                    [mongod_path, "--dbpath", r"C:\data\db"],
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                logger.info("Started mongod directly from %s", mongod_path)
                await asyncio.sleep(3)
                return
            except FileNotFoundError:
                continue
            except Exception as e:
                logger.warning("Failed to start mongod from %s: %s", mongod_path, e)

    raise RuntimeError(
        "MongoDB is not running and could not be started automatically. "
        "Please start MongoDB manually."
    )


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    global _client, _db

    await _ensure_mongodb_running()

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
    from app.db.models.app_settings import AppSettings
    from app.db.models.log import LogRecord

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
            # Settings
            AppSettings,
            # Logs
            LogRecord,
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
