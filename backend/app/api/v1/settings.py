"""Settings endpoints for agent configuration (superuser only)."""

import logging
import os
import shutil
import subprocess
import sys
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any, Literal, get_args, get_origin

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import get_current_superuser
from app.config import get_settings
from app.db.models.app_settings import AgentAuthMode, AppSettings
from app.db.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


# ── Response / Request schemas ──────────────────────────────────


class AgentConfigResponse(BaseModel):
    auth_mode: str
    has_api_key: bool
    masked_api_key: str
    model: str
    thinking_mode: str
    thinking_budget: int
    effort: str
    cli_logged_in: bool


class AgentConfigUpdate(BaseModel):
    auth_mode: str | None = None
    api_key: str | None = None
    model: str | None = None
    thinking_mode: str | None = None
    thinking_budget: int | None = None
    effort: str | None = None


class AgentModelOption(BaseModel):
    value: str
    label: str


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


class CLILoginStatusResponse(BaseModel):
    logged_in: bool
    message: str


# ── Helpers ─────────────────────────────────────────────────────


def _mask_key(key: str) -> str:
    """Mask an API key for display: sk-ant-...xxxx"""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:7]}...{key[-4:]}"


def _check_cli_login() -> bool:
    """Check if Claude CLI has a valid OAuth token.

    Checks (in order):
    1. CLAUDE_CODE_OAUTH_TOKEN environment variable
    2. Auth credential files in ~/.claude/ directory
    """
    # Check env var first (set by `claude setup-token`)
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return True

    # Check for auth files in the Claude config directory
    claude_dir = Path.home() / ".claude"
    if not claude_dir.is_dir():
        return False

    # Claude Code stores auth in these locations
    auth_files = [
        claude_dir / "auth-profiles.json",
        claude_dir / "credentials.json",
        claude_dir / ".credentials.json",
    ]
    for auth_file in auth_files:
        try:
            if auth_file.is_file() and auth_file.stat().st_size > 2:
                return True
        except OSError:
            continue

    return False


def _resolve_api_key(app_settings: AppSettings) -> str:
    """Return the effective API key: DB setting first, then env var fallback."""
    return app_settings.get_agent_api_key() or settings.anthropic_api_key


def _ensure_encryption_available() -> None:
    """Raise 409 if secret encryption keys are not configured."""
    from app.security.key_provider import SecretKeyProviderError, load_encryption_keys

    try:
        keys = load_encryption_keys()
    except SecretKeyProviderError:
        keys = ()
    if not keys:
        logger.warning(
            "API key save blocked: SECRETS_ENCRYPTION_KEYS is not configured. "
            "The app cannot encrypt secrets without this setting."
        )
        import os

        if os.environ.get("TAURI_APP"):
            detail = (
                "Encryption is not configured — API keys cannot be saved. "
                "Please restart the application to auto-generate an encryption key."
            )
        else:
            detail = (
                "Encryption is not configured — API keys cannot be saved. "
                "Please restart the application. If this persists, set "
                "SECRETS_ENCRYPTION_KEYS in your .env file."
            )
        raise HTTPException(status_code=409, detail=detail)


def _collect_literal_model_aliases(annotation: Any) -> list[str]:
    """Collect literal string values from nested typing annotations."""
    origin = get_origin(annotation)
    if origin is Literal:
        return [arg for arg in get_args(annotation) if isinstance(arg, str)]
    if origin is None:
        return []

    values: list[str] = []
    for arg in get_args(annotation):
        values.extend(_collect_literal_model_aliases(arg))
    return values


def _get_agent_sdk_model_aliases() -> list[str]:
    """Read built-in model aliases directly from Agent SDK type hints."""
    try:
        from claude_agent_sdk.types import AgentDefinition
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not import Agent SDK model aliases: %s", exc)
        return []

    annotation = AgentDefinition.__annotations__.get("model")
    if annotation is None:
        return []

    aliases = [value for value in _collect_literal_model_aliases(annotation) if value != "inherit"]

    deduplicated: list[str] = []
    seen: set[str] = set()
    for alias in aliases:
        if alias in seen:
            continue
        seen.add(alias)
        deduplicated.append(alias)
    return deduplicated


DEFAULT_MODEL_BY_FAMILY = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "sonnet-1m": "claude-sonnet-4-6",
    "opus-1m": "claude-opus-4-6",
}

MODEL_ALIAS_TO_NAME = {
    "sonnet": "Claude Sonnet",
    "opus": "Claude Opus",
    "sonnet-1m": "Claude Sonnet 4 (1M)",
    "opus-1m": "Claude Opus 4 (1M)",
}

MODEL_ALIAS_TO_FAMILY = {
    "sonnet": "sonnet",
    "opus": "opus",
    "sonnet-1m": "sonnet-1m",
    "opus-1m": "opus-1m",
    "claude-sonnet-4-5": "sonnet",
    "claude-sonnet-4-6": "sonnet",
    "claude-opus-4-5": "opus",
    "claude-opus-4-6": "opus",
}

FAMILY_TO_API_MODEL = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "sonnet-1m": "claude-sonnet-4-6[1m]",
    "opus-1m": "claude-opus-4-6[1m]",
}

MODEL_FAMILY_ORDER = ("sonnet", "opus", "sonnet-1m", "opus-1m")


def _get_supported_model_families() -> tuple[str, ...]:
    aliases = _get_agent_sdk_model_aliases()
    if not aliases:
        return MODEL_FAMILY_ORDER

    # If the SDK supports a base family, also include its 1M variant
    expanded = set(aliases)
    for alias in aliases:
        one_m = f"{alias}-1m"
        if one_m in DEFAULT_MODEL_BY_FAMILY:
            expanded.add(one_m)

    ordered = tuple(family for family in MODEL_FAMILY_ORDER if family in expanded)
    return ordered or MODEL_FAMILY_ORDER


def _get_model_family(model_id: str) -> str | None:
    normalized = model_id.strip().lower()
    for family in MODEL_FAMILY_ORDER:
        if f"-{family}-" in normalized or normalized == family:
            return family
    return None


def _extract_model_version(model_id: str) -> str | None:
    """Parse version like '4.5' from 'claude-sonnet-4-5-20250929' or '4.6' from 'claude-opus-4-6'."""
    import re

    normalized = model_id.strip().lower()
    # With trailing date: claude-{family}-{ver}-YYYYMMDD
    m = re.match(r"claude-\w+-(\d+(?:-\d+)*)-\d{8}$", normalized)
    if not m:
        # Without date: claude-{family}-{ver}
        m = re.match(r"claude-\w+-(\d+(?:-\d+)*)$", normalized)
    if m:
        return m.group(1).replace("-", ".")
    return None


def _normalize_to_family(model: str) -> str:
    """Normalize any model string to its family alias (sonnet/opus/sonnet-1m/opus-1m)."""
    family = MODEL_ALIAS_TO_FAMILY.get(model.strip().lower())
    if family:
        return family
    family = _get_model_family(model)
    return family or model


def _format_model_label(family: str, latest_exact_id: str | None = None) -> str:
    """Build a clean display name like 'Claude Sonnet 4.5'."""
    base_name = MODEL_ALIAS_TO_NAME.get(family)
    if base_name is None:
        return family
    if latest_exact_id:
        version = _extract_model_version(latest_exact_id)
        if version:
            return f"{base_name} {version}"
    return base_name


def _build_agent_model_options(
    current_model: str,
    latest_by_family: dict[str, str],
) -> list[dict[str, str]]:
    families = _get_supported_model_families()
    options = [
        {
            "value": family,
            "label": _format_model_label(family, latest_by_family.get(family)),
        }
        for family in families
        if family in latest_by_family
    ]

    if not current_model:
        return options

    current_family = _get_model_family(current_model)
    if current_family and current_family in {o["value"] for o in options}:
        return options

    return [{"value": current_model, "label": f"{current_model} (current)"}, *options]


# ── Endpoints ───────────────────────────────────────────────────


@router.get("/agent", response_model=AgentConfigResponse)
async def get_agent_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current agent configuration."""
    app_settings = await AppSettings.get_instance()
    effective_key = _resolve_api_key(app_settings)
    cli_logged_in = _check_cli_login()
    effective_model = _normalize_to_family(app_settings.agent_model)

    return {
        "auth_mode": app_settings.agent_auth_mode.value,
        "has_api_key": bool(effective_key),
        "masked_api_key": _mask_key(effective_key),
        "model": effective_model,
        "thinking_mode": app_settings.agent_thinking_mode,
        "thinking_budget": app_settings.agent_thinking_budget,
        "effort": app_settings.agent_effort,
        "cli_logged_in": cli_logged_in,
    }


@router.get("/agent/models", response_model=list[AgentModelOption])
async def get_agent_models(
    _: User = Depends(get_current_superuser),
) -> list[dict[str, str]]:
    """Get model options derived from installed Agent SDK."""
    app_settings = await AppSettings.get_instance()
    return _build_agent_model_options(app_settings.agent_model, DEFAULT_MODEL_BY_FAMILY)


@router.put("/agent", response_model=AgentConfigResponse)
async def update_agent_config(
    body: AgentConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update agent configuration."""
    app_settings = await AppSettings.get_instance()

    if body.auth_mode is not None:
        try:
            app_settings.agent_auth_mode = AgentAuthMode(body.auth_mode)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid auth_mode. Must be one of: {[m.value for m in AgentAuthMode]}",
            )

    if body.api_key is not None:
        _ensure_encryption_available()
        app_settings.set_agent_api_key(body.api_key)

    if body.model is not None:
        app_settings.agent_model = _normalize_to_family(body.model)

    if body.thinking_mode is not None:
        if body.thinking_mode not in ("adaptive", "enabled", "disabled"):
            raise HTTPException(
                status_code=400,
                detail="Invalid thinking_mode. Must be one of: adaptive, enabled, disabled",
            )
        app_settings.agent_thinking_mode = body.thinking_mode

    if body.thinking_budget is not None:
        app_settings.agent_thinking_budget = body.thinking_budget

    if body.effort is not None:
        if body.effort not in ("low", "medium", "high", "max"):
            raise HTTPException(
                status_code=400,
                detail="Invalid effort. Must be one of: low, medium, high, max",
            )
        app_settings.agent_effort = body.effort

    await app_settings.save_with_timestamp()
    logger.info("Agent config updated: auth_mode=%s", app_settings.agent_auth_mode.value)

    effective_key = _resolve_api_key(app_settings)
    cli_logged_in = _check_cli_login()
    effective_model = _normalize_to_family(app_settings.agent_model)

    return {
        "auth_mode": app_settings.agent_auth_mode.value,
        "has_api_key": bool(effective_key),
        "masked_api_key": _mask_key(effective_key),
        "model": effective_model,
        "thinking_mode": app_settings.agent_thinking_mode,
        "thinking_budget": app_settings.agent_thinking_budget,
        "effort": app_settings.agent_effort,
        "cli_logged_in": cli_logged_in,
    }


@router.post("/agent/test", response_model=TestConnectionResponse)
async def test_agent_connection(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Test the agent connection with current configuration."""
    app_settings = await AppSettings.get_instance()

    if app_settings.agent_auth_mode == AgentAuthMode.API_KEY:
        effective_key = _resolve_api_key(app_settings)
        if not effective_key:
            return {"success": False, "message": "No API key configured"}

        try:
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=effective_key)
            family = _normalize_to_family(app_settings.agent_model)
            api_model = FAMILY_TO_API_MODEL.get(family, family)
            await client.messages.create(
                model=api_model,
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            friendly_name = _format_model_label(family, DEFAULT_MODEL_BY_FAMILY.get(family))
            return {
                "success": True,
                "message": f"Connected successfully (model: {friendly_name})",
            }
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}
    else:
        # Subscription mode — check CLI login
        logged_in = _check_cli_login()
        if logged_in:
            return {"success": True, "message": "Claude CLI is authenticated"}
        return {
            "success": False,
            "message": "Claude CLI not authenticated. Click 'Login with Claude' or run `claude setup-token` in your terminal.",
        }


@router.post("/agent/cli-login-status", response_model=CLILoginStatusResponse)
async def check_cli_login_status(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Check if the Claude CLI is logged in."""
    logged_in = _check_cli_login()
    if logged_in:
        return {"logged_in": True, "message": "Claude CLI is authenticated"}
    return {
        "logged_in": False,
        "message": "Not logged in. Click 'Login with Claude' or run `claude setup-token` in your terminal.",
    }


class CLILoginResponse(BaseModel):
    success: bool
    message: str


@router.post("/agent/cli-login", response_model=CLILoginResponse)
async def start_cli_login(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Start the `claude setup-token` process to authenticate via OAuth.

    Opens a new console window where the user completes authentication.
    The frontend polls GET /settings/agent to detect when cli_logged_in
    becomes true.
    """
    claude_path = shutil.which("claude")
    if not claude_path:
        return {
            "success": False,
            "message": (
                "Claude CLI not found. Install it first: npm install -g @anthropic-ai/claude-code"
            ),
        }

    try:
        popen_kwargs: dict = {}
        if sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        subprocess.Popen(
            [claude_path, "setup-token"],
            **popen_kwargs,
        )
        return {
            "success": True,
            "message": "A terminal opened — complete the login there, then set the token.",
        }
    except Exception as e:
        logger.error("CLI login error: %s", e, exc_info=True)
        return {"success": False, "message": f"Login error: {e}"}


@router.post("/agent/cli-logout", response_model=CLILoginResponse)
async def start_cli_logout(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Log out by clearing Claude CLI OAuth credentials."""
    removed = False

    # Clear env var
    if os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None):
        removed = True

    # Remove credential files
    claude_dir = Path.home() / ".claude"
    for name in ("auth-profiles.json", "credentials.json", ".credentials.json"):
        cred_file = claude_dir / name
        try:
            if cred_file.is_file():
                cred_file.unlink()
                removed = True
                logger.info("Removed credential file: %s", cred_file)
        except OSError as e:
            logger.warning("Could not remove %s: %s", cred_file, e)

    if removed:
        return {"success": True, "message": "Successfully logged out"}
    return {"success": True, "message": "No active session found"}


# ── Embedding / Task Configuration ──────────────────────────────


class EmbeddingConfigResponse(BaseModel):
    defer_embedding_when_gaming: bool
    gaming_process_list: list[str]
    gaming_check_interval_minutes: int


class EmbeddingConfigUpdate(BaseModel):
    defer_embedding_when_gaming: bool | None = None
    gaming_process_list: list[str] | None = None
    gaming_check_interval_minutes: int | None = None


@router.get("/embedding", response_model=EmbeddingConfigResponse)
async def get_embedding_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current embedding task configuration."""
    app_settings = await AppSettings.get_instance()
    return {
        "defer_embedding_when_gaming": app_settings.defer_embedding_when_gaming,
        "gaming_process_list": app_settings.gaming_process_list,
        "gaming_check_interval_minutes": app_settings.gaming_check_interval_minutes,
    }


@router.put("/embedding", response_model=EmbeddingConfigResponse)
async def update_embedding_config(
    body: EmbeddingConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update embedding task configuration."""
    app_settings = await AppSettings.get_instance()

    if body.defer_embedding_when_gaming is not None:
        app_settings.defer_embedding_when_gaming = body.defer_embedding_when_gaming
    if body.gaming_process_list is not None:
        app_settings.gaming_process_list = body.gaming_process_list
    if body.gaming_check_interval_minutes is not None:
        app_settings.gaming_check_interval_minutes = max(1, body.gaming_check_interval_minutes)

    await app_settings.save_with_timestamp()
    logger.info(
        "Embedding config updated: defer_gaming=%s, processes=%s",
        app_settings.defer_embedding_when_gaming,
        app_settings.gaming_process_list,
    )

    return {
        "defer_embedding_when_gaming": app_settings.defer_embedding_when_gaming,
        "gaming_process_list": app_settings.gaming_process_list,
        "gaming_check_interval_minutes": app_settings.gaming_check_interval_minutes,
    }


# ── Embedding Model Selection ────────────────────────────────────


class EmbeddingModelInfo(BaseModel):
    hf_id: str
    label: str
    dimension: int
    description: str
    params_millions: int


class EmbeddingModelConfigResponse(BaseModel):
    current_model: str
    available_models: list[EmbeddingModelInfo]


class EmbeddingModelConfigUpdate(BaseModel):
    model_name: str


@router.get("/embedding/model", response_model=EmbeddingModelConfigResponse)
async def get_embedding_model_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current embedding model and list of available models."""
    from app.knowledge.embedding_models import EMBEDDING_MODELS

    app_settings = await AppSettings.get_instance()
    return {
        "current_model": app_settings.embedding_model_name,
        "available_models": [
            {
                "hf_id": m.hf_id,
                "label": m.label,
                "dimension": m.dimension,
                "description": m.description,
                "params_millions": m.params_millions,
            }
            for m in EMBEDDING_MODELS.values()
        ],
    }


@router.put("/embedding/model", response_model=EmbeddingModelConfigResponse)
async def update_embedding_model_config(
    body: EmbeddingModelConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Switch the active embedding model."""
    from app.knowledge.embedding_models import EMBEDDING_MODELS, SUPPORTED_MODEL_NAMES
    from app.knowledge.embeddings import reload_model

    if body.model_name not in SUPPORTED_MODEL_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {body.model_name}. Supported: {', '.join(SUPPORTED_MODEL_NAMES)}",
        )

    app_settings = await AppSettings.get_instance()
    old_model = app_settings.embedding_model_name
    app_settings.embedding_model_name = body.model_name
    await app_settings.save_with_timestamp()

    # Force model reload on next embedding call
    reload_model()

    logger.info("Embedding model changed: %s → %s", old_model, body.model_name)

    return {
        "current_model": app_settings.embedding_model_name,
        "available_models": [
            {
                "hf_id": m.hf_id,
                "label": m.label,
                "dimension": m.dimension,
                "description": m.description,
                "params_millions": m.params_millions,
            }
            for m in EMBEDDING_MODELS.values()
        ],
    }


# ── Strategy Auto-Discovery Configuration ──────────────────────


class DiscoverySourceResponse(BaseModel):
    id: str
    name: str
    domain: str
    rss_url: str | None
    strategy_extraction: bool


class StrategyDiscoveryConfigResponse(BaseModel):
    enabled: bool
    interval_hours: int
    min_confidence: float
    max_sources: int
    last_run_at: str | None = None
    next_run_at: str | None = None
    sources: list[DiscoverySourceResponse]


class StrategyDiscoveryConfigUpdate(BaseModel):
    enabled: bool | None = None
    interval_hours: int | None = None
    min_confidence: float | None = None
    max_sources: int | None = None


class DiscoveryRunResult(BaseModel):
    sources_crawled: int
    articles_processed: int
    strategies_found: int
    discovery_new_sources: int = 0
    discovery_articles_fetched: int = 0
    discovery_strategies_extracted: int = 0


@router.get("/strategy-discovery", response_model=StrategyDiscoveryConfigResponse)
async def get_strategy_discovery_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get strategy auto-discovery configuration."""
    from app.db.models.news import NewsSource

    app_settings = await AppSettings.get_instance()
    sources = await NewsSource.find(
        NewsSource.strategy_extraction == True  # noqa: E712
    ).to_list()

    try:
        from app.agent.task_scheduler import get_scheduler

        next_run = get_scheduler().discovery_next_run_at
    except Exception:
        next_run = None

    return {
        "enabled": app_settings.auto_discover_enabled,
        "interval_hours": app_settings.auto_discover_interval_hours,
        "min_confidence": app_settings.auto_discover_min_confidence,
        "max_sources": app_settings.auto_discover_max_sources,
        "last_run_at": app_settings.auto_discover_last_run_at.isoformat()
        if app_settings.auto_discover_last_run_at
        else None,
        "next_run_at": next_run.isoformat() if next_run else None,
        "sources": [
            {
                "id": str(s.id),
                "name": s.name,
                "domain": s.domain,
                "rss_url": s.rss_url,
                "strategy_extraction": s.strategy_extraction,
            }
            for s in sources
        ],
    }


@router.put("/strategy-discovery", response_model=StrategyDiscoveryConfigResponse)
async def update_strategy_discovery_config(
    body: StrategyDiscoveryConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update strategy auto-discovery configuration and reschedule."""
    from app.db.models.news import NewsSource

    app_settings = await AppSettings.get_instance()
    reschedule_required = False

    if body.enabled is not None:
        if app_settings.auto_discover_enabled != body.enabled:
            app_settings.auto_discover_enabled = body.enabled
            reschedule_required = True
    if body.interval_hours is not None:
        next_interval = max(1, body.interval_hours)
        if app_settings.auto_discover_interval_hours != next_interval:
            app_settings.auto_discover_interval_hours = next_interval
            reschedule_required = True
    if body.min_confidence is not None:
        app_settings.auto_discover_min_confidence = max(0.0, min(1.0, body.min_confidence))
    if body.max_sources is not None:
        app_settings.auto_discover_max_sources = max(1, min(100, body.max_sources))

    await app_settings.save_with_timestamp()

    if reschedule_required:
        try:
            from app.agent.task_scheduler import get_scheduler

            scheduler = get_scheduler()
            await scheduler.reschedule_auto_discovery()
        except Exception:
            logger.warning("Could not reschedule auto-discovery", exc_info=True)

    sources = await NewsSource.find(
        NewsSource.strategy_extraction == True  # noqa: E712
    ).to_list()

    try:
        from app.agent.task_scheduler import get_scheduler

        next_run = get_scheduler().discovery_next_run_at
    except Exception:
        next_run = None

    return {
        "enabled": app_settings.auto_discover_enabled,
        "interval_hours": app_settings.auto_discover_interval_hours,
        "min_confidence": app_settings.auto_discover_min_confidence,
        "max_sources": app_settings.auto_discover_max_sources,
        "last_run_at": app_settings.auto_discover_last_run_at.isoformat()
        if app_settings.auto_discover_last_run_at
        else None,
        "next_run_at": next_run.isoformat() if next_run else None,
        "sources": [
            {
                "id": str(s.id),
                "name": s.name,
                "domain": s.domain,
                "rss_url": s.rss_url,
                "strategy_extraction": s.strategy_extraction,
            }
            for s in sources
        ],
    }


@router.post("/strategy-discovery/run-now")
async def run_strategy_discovery_now(
    current_user: User = Depends(get_current_superuser),
) -> StreamingResponse:
    """Run one strategy discovery cycle with streaming progress via SSE."""
    import asyncio
    import json

    from app.services.strategy_discovery import StrategyDiscoveryService

    user_id = current_user.id

    async def event_stream() -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        async def on_progress(event: dict) -> None:
            await queue.put(event)

        async def run_cycle() -> None:
            try:
                service = StrategyDiscoveryService()
                stats = await service.run_discovery_cycle(
                    on_progress=on_progress,
                    user_id=user_id,
                )

                # Persist last-run timestamp
                from datetime import UTC
                from datetime import datetime as _dt

                _app = await AppSettings.get_instance()
                _app.auto_discover_last_run_at = _dt.now(UTC)
                await _app.save_with_timestamp()

                await queue.put({"step": "complete", "stats": stats})
            except Exception as exc:
                await queue.put({"step": "error", "message": str(exc)})
            finally:
                await queue.put(None)

        asyncio.create_task(run_cycle())  # noqa: RUF006
        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Exchange (OKX) Configuration ────────────────────────────────


class ExchangeConfigResponse(BaseModel):
    has_api_key: bool
    masked_api_key: str
    has_secret_key: bool
    masked_secret_key: str
    has_passphrase: bool
    sandbox: bool


class ExchangeCredentialsRevealResponse(BaseModel):
    api_key: str
    secret_key: str
    passphrase: str


class ExchangeConfigUpdate(BaseModel):
    api_key: str | None = None
    secret_key: str | None = None
    passphrase: str | None = None
    sandbox: bool | None = None


def _resolve_okx_api_key(app_settings: AppSettings) -> str:
    return app_settings.get_okx_api_key() or settings.okx_api_key


def _resolve_okx_secret_key(app_settings: AppSettings) -> str:
    return app_settings.get_okx_secret_key() or settings.okx_secret_key


def _resolve_okx_passphrase(app_settings: AppSettings) -> str:
    return app_settings.get_okx_passphrase() or settings.okx_passphrase


def _build_exchange_response(app_settings: AppSettings) -> dict:
    api_key = _resolve_okx_api_key(app_settings)
    secret_key = _resolve_okx_secret_key(app_settings)
    passphrase = _resolve_okx_passphrase(app_settings)
    return {
        "has_api_key": bool(api_key),
        "masked_api_key": _mask_key(api_key),
        "has_secret_key": bool(secret_key),
        "masked_secret_key": _mask_key(secret_key),
        "has_passphrase": bool(passphrase),
        "sandbox": app_settings.okx_sandbox,
    }


@router.get("/exchange", response_model=ExchangeConfigResponse)
async def get_exchange_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current OKX exchange configuration."""
    app_settings = await AppSettings.get_instance()
    return _build_exchange_response(app_settings)


@router.post("/exchange/reveal", response_model=ExchangeCredentialsRevealResponse)
async def reveal_exchange_credentials(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Reveal decrypted OKX exchange credentials (superuser only)."""
    app_settings = await AppSettings.get_instance()
    return {
        "api_key": _resolve_okx_api_key(app_settings),
        "secret_key": _resolve_okx_secret_key(app_settings),
        "passphrase": _resolve_okx_passphrase(app_settings),
    }


@router.put("/exchange", response_model=ExchangeConfigResponse)
async def update_exchange_config(
    body: ExchangeConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update OKX exchange configuration."""
    app_settings = await AppSettings.get_instance()

    if any(v is not None for v in (body.api_key, body.secret_key, body.passphrase)):
        _ensure_encryption_available()

    if body.api_key is not None:
        app_settings.set_okx_api_key(body.api_key)
    if body.secret_key is not None:
        app_settings.set_okx_secret_key(body.secret_key)
    if body.passphrase is not None:
        app_settings.set_okx_passphrase(body.passphrase)
    if body.sandbox is not None:
        app_settings.okx_sandbox = body.sandbox

    await app_settings.save_with_timestamp()
    logger.info("Exchange config updated (sandbox=%s)", app_settings.okx_sandbox)

    return _build_exchange_response(app_settings)


@router.post("/exchange/test", response_model=TestConnectionResponse)
async def test_exchange_connection(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Test the OKX exchange connection with current credentials."""
    from app.exchange.okx_client import OKXClient

    try:
        client = await OKXClient.create()
        result = await client.get_account_balance()
        if result.get("code") == "0":
            return {"success": True, "message": "Connected to OKX successfully"}
        msg = result.get("msg", "Unknown error")
        return {"success": False, "message": f"OKX API error: {msg}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {e}"}


# ── Brave Search Configuration ──────────────────────────────────


class BraveSearchConfigResponse(BaseModel):
    has_api_key: bool
    masked_api_key: str


class BraveSearchConfigUpdate(BaseModel):
    api_key: str | None = None


def _resolve_brave_search_api_key(app_settings: AppSettings) -> str:
    return app_settings.get_brave_search_api_key() or settings.brave_search_api_key


def _build_brave_search_response(app_settings: AppSettings) -> dict:
    api_key = _resolve_brave_search_api_key(app_settings)
    return {
        "has_api_key": bool(api_key),
        "masked_api_key": _mask_key(api_key),
    }


@router.get("/brave-search", response_model=BraveSearchConfigResponse)
async def get_brave_search_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current Brave Search configuration."""
    app_settings = await AppSettings.get_instance()
    return _build_brave_search_response(app_settings)


@router.post("/brave-search/reveal")
async def reveal_brave_search_credentials(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Reveal decrypted Brave Search API key (superuser only)."""
    app_settings = await AppSettings.get_instance()
    return {"api_key": _resolve_brave_search_api_key(app_settings)}


@router.put("/brave-search", response_model=BraveSearchConfigResponse)
async def update_brave_search_config(
    body: BraveSearchConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update Brave Search configuration."""
    app_settings = await AppSettings.get_instance()

    if body.api_key is not None:
        _ensure_encryption_available()
        app_settings.set_brave_search_api_key(body.api_key)

    await app_settings.save_with_timestamp()
    logger.info("Brave Search config updated")

    return _build_brave_search_response(app_settings)


@router.post("/brave-search/test", response_model=TestConnectionResponse)
async def test_brave_search_connection(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Test the Brave Search API connection with current key."""
    import httpx

    app_settings = await AppSettings.get_instance()
    api_key = _resolve_brave_search_api_key(app_settings)
    if not api_key:
        return {"success": False, "message": "Brave Search API key not configured"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": "test", "count": "1"},
                headers={"X-Subscription-Token": api_key},
                timeout=10.0,
            )
        if resp.status_code == 200:
            return {"success": True, "message": "Brave Search API connected successfully"}
        if resp.status_code == 401:
            return {"success": False, "message": "Invalid API key (401 Unauthorized)"}
        return {"success": False, "message": f"Brave API error: HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {e}"}


# ── Auth / Token Expiry Configuration ──────────────────────────


class AuthConfigResponse(BaseModel):
    access_token_expire_minutes: int


class AuthConfigUpdate(BaseModel):
    access_token_expire_minutes: int | None = None


@router.get("/auth", response_model=AuthConfigResponse)
async def get_auth_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current auth / token expiry configuration."""
    app_settings = await AppSettings.get_instance()
    effective = app_settings.access_token_expire_minutes or settings.access_token_expire_minutes
    return {"access_token_expire_minutes": effective}


@router.put("/auth", response_model=AuthConfigResponse)
async def update_auth_config(
    body: AuthConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update token expiry configuration. 0 = no expiry."""
    app_settings = await AppSettings.get_instance()
    if body.access_token_expire_minutes is not None:
        app_settings.access_token_expire_minutes = max(0, body.access_token_expire_minutes)
    await app_settings.save_with_timestamp()
    effective = app_settings.access_token_expire_minutes or settings.access_token_expire_minutes
    logger.info("Auth config updated (expire_minutes=%d)", effective)
    return {"access_token_expire_minutes": effective}


# ── Session Retention Configuration ─────────────────────────────


class SessionRetentionConfigResponse(BaseModel):
    session_retention_days: int


class SessionRetentionConfigUpdate(BaseModel):
    session_retention_days: int | None = None


@router.get("/session-retention", response_model=SessionRetentionConfigResponse)
async def get_session_retention_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current session retention configuration."""
    app_settings = await AppSettings.get_instance()
    return {"session_retention_days": app_settings.session_retention_days}


@router.put("/session-retention", response_model=SessionRetentionConfigResponse)
async def update_session_retention_config(
    body: SessionRetentionConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update session retention. 0 = keep forever."""
    app_settings = await AppSettings.get_instance()
    if body.session_retention_days is not None:
        app_settings.session_retention_days = max(0, body.session_retention_days)
    await app_settings.save_with_timestamp()

    # Reschedule the cleanup job
    try:
        from app.agent.task_scheduler import get_scheduler

        scheduler = get_scheduler()
        await scheduler.reschedule_session_cleanup()
    except Exception:
        logger.warning("Could not reschedule session cleanup", exc_info=True)

    logger.info("Session retention updated (days=%d)", app_settings.session_retention_days)
    return {"session_retention_days": app_settings.session_retention_days}


# ── Autostart Configuration ────────────────────────────────────


class AutostartConfigResponse(BaseModel):
    enabled: bool


class AutostartConfigUpdate(BaseModel):
    enabled: bool


@router.get("/autostart", response_model=AutostartConfigResponse)
async def get_autostart_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current autostart configuration."""
    app_settings = await AppSettings.get_instance()
    return {"enabled": app_settings.app_autostart_enabled}


@router.put("/autostart", response_model=AutostartConfigResponse)
async def update_autostart_config(
    body: AutostartConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update autostart configuration."""
    app_settings = await AppSettings.get_instance()
    app_settings.app_autostart_enabled = body.enabled
    await app_settings.save_with_timestamp()
    logger.info("Autostart updated (enabled=%s)", app_settings.app_autostart_enabled)
    return {"enabled": app_settings.app_autostart_enabled}


# ── Native Notification Configuration ──────────────────────────


class NativeNotificationConfigResponse(BaseModel):
    enabled: bool


class NativeNotificationConfigUpdate(BaseModel):
    enabled: bool


@router.get("/notifications/native", response_model=NativeNotificationConfigResponse)
async def get_native_notification_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current native notification configuration."""
    app_settings = await AppSettings.get_instance()
    return {"enabled": app_settings.native_notifications_enabled}


@router.put("/notifications/native", response_model=NativeNotificationConfigResponse)
async def update_native_notification_config(
    body: NativeNotificationConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update native notification configuration."""
    app_settings = await AppSettings.get_instance()
    app_settings.native_notifications_enabled = body.enabled
    await app_settings.save_with_timestamp()
    logger.info(
        "Native notifications updated (enabled=%s)",
        app_settings.native_notifications_enabled,
    )
    return {"enabled": app_settings.native_notifications_enabled}


# ── Apprise Notification Configuration ────────────────────────


def _mask_url(url: str) -> str:
    """Mask an Apprise URL for display, preserving the service scheme."""
    if not url:
        return ""
    # Split on :// to keep scheme visible
    if "://" in url:
        scheme, _rest = url.split("://", 1)
        return f"{scheme}://***"
    return "***"


class AppriseConfigResponse(BaseModel):
    notification_urls: list[str]
    url_count: int
    has_email_url: bool
    masked_email_url: str


class AppriseConfigUpdate(BaseModel):
    notification_urls: list[str] | None = None
    email_url: str | None = None


class AppriseTestResponse(BaseModel):
    success: bool
    message: str


@router.get("/notifications/apprise", response_model=AppriseConfigResponse)
async def get_apprise_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get masked Apprise notification configuration."""
    app_settings = await AppSettings.get_instance()
    urls = app_settings.get_notification_urls()
    email_url = app_settings.get_email_url()
    return {
        "notification_urls": [_mask_url(u) for u in urls],
        "url_count": len(urls),
        "has_email_url": bool(email_url),
        "masked_email_url": _mask_url(email_url),
    }


@router.put("/notifications/apprise", response_model=AppriseConfigResponse)
async def update_apprise_config(
    body: AppriseConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update Apprise notification URLs and/or email URL."""
    app_settings = await AppSettings.get_instance()

    if body.notification_urls is not None or body.email_url is not None:
        _ensure_encryption_available()

    if body.notification_urls is not None:
        app_settings.set_notification_urls(body.notification_urls)
    if body.email_url is not None:
        app_settings.set_email_url(body.email_url)

    await app_settings.save_with_timestamp()
    logger.info(
        "Apprise config updated (url_count=%d, has_email=%s)",
        len(app_settings.get_notification_urls()),
        bool(app_settings.get_email_url()),
    )

    urls = app_settings.get_notification_urls()
    email_url = app_settings.get_email_url()
    return {
        "notification_urls": [_mask_url(u) for u in urls],
        "url_count": len(urls),
        "has_email_url": bool(email_url),
        "masked_email_url": _mask_url(email_url),
    }


@router.post("/notifications/apprise/test", response_model=AppriseTestResponse)
async def test_apprise_notification(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Send a test notification via all configured Apprise channels."""
    from app.services.email_service import NotifyService

    service = NotifyService()
    urls = service.notification_urls
    email_url = service.email_url

    if not urls and not email_url:
        return {"success": False, "message": "No notification URLs configured"}

    all_urls = [*urls]
    if email_url:
        all_urls.append(email_url)

    result = await service._send(
        all_urls,
        "Trading Agent — Test Notification",
        "This is a test notification from Trading Agent. If you see this, your Apprise configuration is working.",
        "info",
    )
    if result:
        return {"success": True, "message": f"Test sent to {len(all_urls)} channel(s)"}
    return {"success": False, "message": "One or more channels failed to deliver"}


# ── System Processes (for process selector dialog) ─────────────


@router.get("/system-processes")
async def get_system_processes(
    _: User = Depends(get_current_superuser),
) -> dict:
    """List unique running processes with memory usage for the process selector UI."""
    import psutil

    processes: dict[str, dict] = {}
    for proc in psutil.process_iter(["pid", "name", "memory_info"]):
        try:
            info = proc.info
            name = info["name"]
            if name and name not in processes:
                mem = info["memory_info"]
                processes[name] = {
                    "name": name,
                    "pid": info["pid"],
                    "memory_mb": round(mem.rss / (1024 * 1024), 1) if mem else 0,
                }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return {"processes": sorted(processes.values(), key=lambda x: x["memory_mb"], reverse=True)}


# ── Installed Applications (for process selector dialog) ─────────────


@router.get("/installed-apps")
async def get_installed_apps(
    _: User = Depends(get_current_superuser),
) -> dict:
    """List installed applications from Windows registry and game launchers."""
    from app.services.installed_apps_scanner import scan_installed_apps

    apps = await scan_installed_apps()
    return {
        "apps": [
            {
                "display_name": app.display_name,
                "exe_name": app.exe_name,
                "publisher": app.publisher,
                "install_location": app.install_location,
                "source": app.source,
                "icon_base64": app.icon_base64,
                "install_size_mb": app.install_size_mb,
            }
            for app in apps
        ]
    }
