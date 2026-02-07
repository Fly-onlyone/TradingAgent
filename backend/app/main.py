"""FastAPI application entry point."""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# Defense-in-depth: set ProactorEventLoop on Windows in case this module is
# imported before the event loop is created (e.g. running uvicorn directly).
# The primary policy setting is in run.py at module level.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.session import init_db, close_db
from app.logging_config import setup_logging, get_mongo_handler
from app.api.v1 import router as api_v1_router
from app.api.websocket import router as ws_router

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    mongo_handler = setup_logging()
    await init_db()
    mongo_handler.start()
    logger.info("Application started")
    yield
    # Shutdown
    logger.info("Application shutting down")
    if mongo_handler:
        await mongo_handler.stop()
    await close_db()


app = FastAPI(
    title=settings.app_name,
    description="Automatic Trading Agent with Claude AI",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
from app.middleware.request_logging import RequestLoggingMiddleware

app.add_middleware(RequestLoggingMiddleware)

# Skip auth in debug mode — all endpoints use a mock superuser
if settings.debug:
    from app.api.v1.auth import get_current_active_user, get_dev_user

    app.dependency_overrides[get_current_active_user] = get_dev_user

# Include routers
app.include_router(api_v1_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/ws")


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}
