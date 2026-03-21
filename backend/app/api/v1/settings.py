"""Settings endpoints for agent configuration (superuser only)."""

import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Literal, get_args, get_origin

from fastapi import APIRouter, Depends, HTTPException
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
    max_thinking_tokens: int
    cli_logged_in: bool


class AgentConfigUpdate(BaseModel):
    auth_mode: str | None = None
    api_key: str | None = None
    model: str | None = None
    max_thinking_tokens: int | None = None


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
        raise HTTPException(
            status_code=409,
            detail="Secret encryption is not configured. Set SECRETS_ENCRYPTION_KEYS "
            "before saving API keys.",
        )


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

    aliases = [
        value
        for value in _collect_literal_model_aliases(annotation)
        if value != "inherit"
    ]

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
    "haiku": "claude-haiku-4-5-20251001",
}

MODEL_ALIAS_TO_NAME = {
    "sonnet": "Claude Sonnet",
    "opus": "Claude Opus",
    "haiku": "Claude Haiku",
}

MODEL_ALIAS_TO_FAMILY = {
    "sonnet": "sonnet",
    "opus": "opus",
    "haiku": "haiku",
    "claude-sonnet-4-5": "sonnet",
    "claude-sonnet-4-6": "sonnet",
    "claude-opus-4-5": "opus",
    "claude-opus-4-6": "opus",
    "claude-haiku-4-5": "haiku",
}

FAMILY_TO_API_MODEL = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "haiku": "claude-haiku-4-5",
}

MODEL_FAMILY_ORDER = ("sonnet", "opus", "haiku")


def _get_supported_model_families() -> tuple[str, ...]:
    aliases = _get_agent_sdk_model_aliases()
    if not aliases:
        return MODEL_FAMILY_ORDER

    ordered = tuple(family for family in MODEL_FAMILY_ORDER if family in aliases)
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
    """Normalize any model string to its family alias (sonnet/opus/haiku)."""
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
        "max_thinking_tokens": app_settings.agent_max_thinking_tokens,
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

    if body.max_thinking_tokens is not None:
        app_settings.agent_max_thinking_tokens = body.max_thinking_tokens

    await app_settings.save_with_timestamp()
    logger.info(
        "Agent config updated: auth_mode=%s", app_settings.agent_auth_mode.value
    )

    effective_key = _resolve_api_key(app_settings)
    cli_logged_in = _check_cli_login()
    effective_model = _normalize_to_family(app_settings.agent_model)

    return {
        "auth_mode": app_settings.agent_auth_mode.value,
        "has_api_key": bool(effective_key),
        "masked_api_key": _mask_key(effective_key),
        "model": effective_model,
        "max_thinking_tokens": app_settings.agent_max_thinking_tokens,
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
            friendly_name = _format_model_label(
                family, DEFAULT_MODEL_BY_FAMILY.get(family)
            )
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
        app_settings.gaming_check_interval_minutes = max(
            1, body.gaming_check_interval_minutes
        )

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
    sources: list[DiscoverySourceResponse]


class StrategyDiscoveryConfigUpdate(BaseModel):
    enabled: bool | None = None
    interval_hours: int | None = None
    min_confidence: float | None = None


class DiscoveryRunResult(BaseModel):
    sources_crawled: int
    articles_processed: int
    strategies_found: int


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

    return {
        "enabled": app_settings.auto_discover_enabled,
        "interval_hours": app_settings.auto_discover_interval_hours,
        "min_confidence": app_settings.auto_discover_min_confidence,
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

    if body.enabled is not None:
        app_settings.auto_discover_enabled = body.enabled
    if body.interval_hours is not None:
        app_settings.auto_discover_interval_hours = max(1, body.interval_hours)
    if body.min_confidence is not None:
        app_settings.auto_discover_min_confidence = max(0.0, min(1.0, body.min_confidence))

    await app_settings.save_with_timestamp()

    # Reschedule the discovery job
    try:
        from app.agent.task_scheduler import AgentTaskScheduler

        scheduler = AgentTaskScheduler()
        await scheduler.reschedule_auto_discovery()
    except Exception:
        logger.warning("Could not reschedule auto-discovery", exc_info=True)

    sources = await NewsSource.find(
        NewsSource.strategy_extraction == True  # noqa: E712
    ).to_list()

    return {
        "enabled": app_settings.auto_discover_enabled,
        "interval_hours": app_settings.auto_discover_interval_hours,
        "min_confidence": app_settings.auto_discover_min_confidence,
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


@router.post("/strategy-discovery/run-now", response_model=DiscoveryRunResult)
async def run_strategy_discovery_now(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Run one strategy discovery cycle immediately."""
    from app.services.strategy_discovery import StrategyDiscoveryService

    service = StrategyDiscoveryService()
    stats = await service.run_discovery_cycle()
    return stats


# ── Exchange (OKX) Configuration ────────────────────────────────


class ExchangeConfigResponse(BaseModel):
    has_api_key: bool
    masked_api_key: str
    has_secret_key: bool
    masked_secret_key: str
    has_passphrase: bool
    sandbox: bool


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
    effective = (
        app_settings.access_token_expire_minutes or settings.access_token_expire_minutes
    )
    return {"access_token_expire_minutes": effective}


@router.put("/auth", response_model=AuthConfigResponse)
async def update_auth_config(
    body: AuthConfigUpdate,
    _: User = Depends(get_current_superuser),
) -> dict:
    """Update token expiry configuration. 0 = no expiry."""
    app_settings = await AppSettings.get_instance()
    if body.access_token_expire_minutes is not None:
        app_settings.access_token_expire_minutes = max(
            0, body.access_token_expire_minutes
        )
    await app_settings.save_with_timestamp()
    effective = (
        app_settings.access_token_expire_minutes or settings.access_token_expire_minutes
    )
    logger.info("Auth config updated (expire_minutes=%d)", effective)
    return {"access_token_expire_minutes": effective}
