"""Request logging middleware — logs method, path, status, and duration."""

import logging
import time
import uuid

import sentry_sdk
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.logging_config import request_id_var, user_id_var

logger = logging.getLogger("app.middleware.request")

# Paths to skip logging
SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach a unique request_id and log every HTTP request/response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip noisy endpoints
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        # Generate and set request ID
        req_id = uuid.uuid4().hex
        request_id_var.set(req_id)
        sentry_sdk.set_tag("request_id", req_id)

        # Try to extract user_id from the auth state (set by FastAPI deps)
        user_id: str | None = None
        if hasattr(request.state, "user_id"):
            user_id = request.state.user_id
            user_id_var.set(user_id)

        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000)
            logger.error(
                "%s %s 500 %dms",
                request.method,
                request.url.path,
                duration_ms,
                exc_info=True,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000)

        # Inject request_id in response headers for traceability
        response.headers["X-Request-ID"] = req_id

        log_fn = logger.info if response.status_code < 400 else logger.warning
        log_fn(
            "%s %s %s %dms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        # Reset context vars
        request_id_var.set(None)
        user_id_var.set(None)

        return response
