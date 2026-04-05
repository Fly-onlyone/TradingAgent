"""FastAPI application entry point."""

import asyncio
import logging
import os
import re
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

# Defense-in-depth: set ProactorEventLoop on Windows in case this module is
# imported before the event loop is created (e.g. running uvicorn directly).
# The primary policy setting is in run.py at module level.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.types import Event
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.agent.task_scheduler import get_scheduler
from app.api.v1 import router as api_v1_router
from app.api.websocket import router as ws_router
from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import close_db, init_db
from app.knowledge.embeddings import preload_model as preload_embedding_model
from app.logging_config import setup_logging, start_all_mongo_handlers, stop_all_mongo_handlers
from app.middleware.request_logging import RequestLoggingMiddleware

settings = get_settings()
logger = logging.getLogger(__name__)


def _traces_sampler(sampling_context: dict) -> float:
    """Custom sampler: downsample noisy endpoints, use configured rate otherwise."""
    del sampling_context
    return settings.sentry_traces_sample_rate


_PII_PATTERNS = [
    (
        re.compile(r"(?i)(api[_-]?key|secret[_-]?key|passphrase|password|token)\s*[:=]\s*\S+"),
        r"\1=***",
    ),
    (re.compile(r"(?i)(Bearer\s+)\S+"), r"\1***"),
]


def _before_send(event: Event, hint: dict[str, Any]) -> Event | None:
    """Scrub potential PII/secrets from error event messages."""
    if message := event.get("message"):
        for pattern, replacement in _PII_PATTERNS:
            message = pattern.sub(replacement, message)
        event["message"] = message

    for entry in event.get("exception", {}).get("values", []):
        if value := entry.get("value"):
            for pattern, replacement in _PII_PATTERNS:
                value = pattern.sub(replacement, value)
            entry["value"] = value

    return event


def _before_send_transaction(
    event: Event,
    hint: dict[str, Any],
) -> Event | None:
    """Drop noise: SPA-serving routes, malformed outbound calls, debug artifacts."""
    name = event.get("transaction", "")
    if not name:
        return event
    if name in {"/api/v1/logs/frontend", "/health"}:
        return None
    # Drop outbound HTTP client calls leaking as transactions (http://*/...)
    if name.startswith("http://"):
        return None
    # Drop debug/test artifacts
    if name.startswith("manual-profile-"):
        return None
    # Keep API and WebSocket transactions
    if name.startswith(("/api/", "/ws/")):
        return event
    # Drop everything else (SPA catch-all routes: /, /agent, /settings, etc.)
    return None


if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sampler=_traces_sampler,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
        environment=settings.sentry_environment
        or ("development" if settings.debug else "production"),
        release=settings.sentry_release or None,
        send_default_pii=False,
        enable_logs=settings.sentry_enable_logs,
        before_send=_before_send,
        before_send_transaction=_before_send_transaction,
        integrations=[
            LoggingIntegration(
                level=logging.INFO,  # Breadcrumbs from INFO+
                event_level=logging.ERROR,  # Events from ERROR+
            ),
        ],
    )


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    setup_logging()
    await init_db()

    scheduler = get_scheduler()
    if settings.debug:
        asyncio.create_task(scheduler.start())
    else:
        await scheduler.start()

    # Keep heavyweight embedding warmup opt-in so idle startup stays lighter on RAM.
    if settings.preload_embeddings_on_startup:
        asyncio.create_task(preload_embedding_model())

    start_all_mongo_handlers()
    logger.info("Application started")
    yield
    # Shutdown
    logger.info("Application shutting down")
    await scheduler.stop()
    await stop_all_mongo_handlers()
    await close_db()


app = FastAPI(
    title=settings.app_name,
    description="Automatic Trading agent with Claude AI",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Configure CORS
if settings.cors_origins:
    _cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
elif settings.debug:
    _cors_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://tauri.localhost",
        "http://tauri.localhost",
    ]
elif os.environ.get("TAURI_APP"):
    _backend_port = os.environ.get("BACKEND_PORT", "7000")
    _cors_origins = [
        "https://tauri.localhost",
        "http://tauri.localhost",
        f"http://localhost:{_backend_port}",
        f"http://127.0.0.1:{_backend_port}",
    ]
else:
    _cors_origins = []
    logger.warning(
        "No CORS origins configured and debug=False — all cross-origin requests will be denied. "
        "Set CORS_ORIGINS in your .env file."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)

# Skip auth in debug mode — all endpoints use a mock superuser
if settings.debug and settings.allow_debug_auth_bypass:
    from app.api.v1.auth import get_current_active_user, get_dev_user

    app.dependency_overrides[get_current_active_user] = get_dev_user
    logger.warning("Debug auth bypass is ACTIVE — all endpoints use a mock superuser")

# Include routers
app.include_router(api_v1_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/ws")


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}
