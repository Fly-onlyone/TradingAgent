"""MongoDB database session management with Beanie ODM."""

import asyncio
import logging
import re
import subprocess
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError

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
            result = await asyncio.to_thread(
                subprocess.run,
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


async def _validate_app_settings_secret_encryption() -> None:
    """Validate and migrate app settings secrets before serving traffic."""
    from app.db.models.app_settings import AppSettings
    from app.security.secrets_crypto import SecretDecryptionError, SecretEncryptionError

    app_settings = await AppSettings.get_instance()
    if not app_settings.has_persisted_secret_values():
        return

    try:
        await app_settings.migrate_plaintext_secrets_if_needed()
        app_settings.validate_decryptable_secrets()
    except (SecretEncryptionError, SecretDecryptionError, RuntimeError) as exc:
        raise RuntimeError(
            "Stored application secrets could not be validated. Configure "
            "`SECRETS_ENCRYPTION_KEYS` (comma-separated Fernet keys) "
            "before startup."
        ) from exc


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    global _client, _db

    await _ensure_mongodb_running()

    _client = AsyncIOMotorClient(settings.mongodb_url)
    _db = _client[settings.mongodb_db_name]

    # Import all document models for Beanie initialization
    from app.db.models.agent_decision import AgentDecision
    from app.db.models.agent_session import AgentSession
    from app.db.models.agent_task import AgentTask
    from app.db.models.app_settings import AppSettings
    from app.db.models.knowledge import StrategyKnowledge, TradeLesson, TradingPattern
    from app.db.models.log import LogRecord
    from app.db.models.market import MarketData, Trade
    from app.db.models.news import CredibilityEvent, NewsArticle, NewsSource
    from app.db.models.notification import Notification, UserNotificationSettings
    from app.db.models.order import Order
    from app.db.models.strategy import Strategy
    from app.db.models.strategy_rating import StrategyRating
    from app.db.models.user import User

    document_models = [
        User,
        Order,
        Strategy,
        StrategyKnowledge,
        StrategyRating,
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
    ]

    # Initialize Beanie with all document models.
    # MongoDB time-series indexes can raise IndexOptionsConflict when existing
    # index metadata ordering differs from what the current driver sends.
    for _ in range(5):
        try:
            await init_beanie(
                database=_db,
                document_models=document_models,
            )
            break
        except OperationFailure as exc:
            error_text = str(exc)
            is_equivalent_index_conflict = (
                exc.code == 85
                and "equivalent index already exists with the same name but different options"
                in error_text
            )
            if not is_equivalent_index_conflict:
                raise

            index_name_match = re.search(r'name: "([^"]+)"', error_text)
            if not index_name_match:
                raise

            index_name = index_name_match.group(1)
            dropped = False
            for collection_name in ("market_data", "trades"):
                try:
                    await _db[collection_name].drop_index(index_name)
                    logger.warning(
                        "Dropped conflicting time-series index %s on %s; retrying Beanie init",
                        index_name,
                        collection_name,
                    )
                    dropped = True
                except OperationFailure:
                    continue

            if not dropped:
                raise
    else:
        raise RuntimeError(
            "Failed to initialize Beanie after resolving index conflicts"
        )

    await _validate_app_settings_secret_encryption()


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
