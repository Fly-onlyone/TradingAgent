"""Settings endpoints for agent configuration (superuser only)."""

import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.config import get_settings
from app.db.models.app_settings import AgentAuthMode, AppSettings
from app.db.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser privileges required")
    return current_user


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


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


class CLILoginStatusResponse(BaseModel):
    logged_in: bool
    message: str


class ProtonPassStatusResponse(BaseModel):
    available: bool
    logged_in: bool
    configured: bool
    using_reference: bool
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
            "or configure Proton Pass before saving API keys.",
        )


def _find_pass_cli() -> str | None:
    for candidate in ("pass-cli", "pass"):
        cli = shutil.which(candidate)
        if cli:
            return cli
    return None


def _check_proton_pass_login() -> tuple[bool, str, bool]:
    """Return login status and availability for Proton Pass CLI."""
    cli_path = _find_pass_cli()
    if not cli_path:
        return False, "Proton Pass CLI not found (`pass-cli`)", False

    try:
        result = subprocess.run(
            [cli_path, "test"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as e:  # noqa: BLE001
        return False, f"Failed to check Proton Pass auth: {e}", True

    if result.returncode == 0:
        return True, "Proton Pass CLI is authenticated", True

    error_message = (
        result.stderr.strip() or result.stdout.strip() or "Not authenticated"
    )
    return False, error_message, True


# ── Endpoints ───────────────────────────────────────────────────


@router.get("/agent", response_model=AgentConfigResponse)
async def get_agent_config(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get current agent configuration."""
    app_settings = await AppSettings.get_instance()
    effective_key = _resolve_api_key(app_settings)
    cli_logged_in = _check_cli_login()

    return {
        "auth_mode": app_settings.agent_auth_mode.value,
        "has_api_key": bool(effective_key),
        "masked_api_key": _mask_key(effective_key),
        "model": app_settings.agent_model,
        "max_thinking_tokens": app_settings.agent_max_thinking_tokens,
        "cli_logged_in": cli_logged_in,
    }


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
        app_settings.agent_model = body.model

    if body.max_thinking_tokens is not None:
        app_settings.agent_max_thinking_tokens = body.max_thinking_tokens

    await app_settings.save_changes()
    logger.info(
        "Agent config updated: auth_mode=%s", app_settings.agent_auth_mode.value
    )

    effective_key = _resolve_api_key(app_settings)
    cli_logged_in = _check_cli_login()

    return {
        "auth_mode": app_settings.agent_auth_mode.value,
        "has_api_key": bool(effective_key),
        "masked_api_key": _mask_key(effective_key),
        "model": app_settings.agent_model,
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

            client = anthropic.Anthropic(api_key=effective_key)
            client.messages.create(
                model=app_settings.agent_model,
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return {
                "success": True,
                "message": f"Connected successfully (model: {app_settings.agent_model})",
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
                "Claude CLI not found. Install it first: "
                "npm install -g @anthropic-ai/claude-code"
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


@router.get("/security/proton-pass", response_model=ProtonPassStatusResponse)
async def get_proton_pass_status(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Get Proton Pass CLI availability/authentication status."""
    logged_in, message, available = _check_proton_pass_login()
    using_reference = bool(settings.secrets_encryption_keys_ref)
    configured = using_reference or bool(settings.secrets_encryption_keys)

    return {
        "available": available,
        "logged_in": logged_in,
        "configured": configured,
        "using_reference": using_reference,
        "message": message,
    }


@router.post("/security/proton-pass/login", response_model=CLILoginResponse)
async def start_proton_pass_login(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Start Proton Pass web login in a separate terminal window."""
    cli_path = _find_pass_cli()
    if not cli_path:
        return {
            "success": False,
            "message": "Proton Pass CLI not found. Install `pass-cli` first.",
        }

    logged_in, _, _ = _check_proton_pass_login()
    if logged_in:
        return {"success": True, "message": "Proton Pass CLI is already authenticated"}

    try:
        popen_kwargs: dict = {}
        if sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        subprocess.Popen([cli_path, "login"], **popen_kwargs)
        return {
            "success": True,
            "message": "A terminal opened. Complete Proton Pass login in your browser.",
        }
    except Exception as e:
        logger.error("Proton Pass login error: %s", e, exc_info=True)
        return {"success": False, "message": f"Login error: {e}"}


@router.post("/security/proton-pass/logout", response_model=CLILoginResponse)
async def proton_pass_logout(
    _: User = Depends(get_current_superuser),
) -> dict:
    """Log out Proton Pass CLI by removing local session."""
    cli_path = _find_pass_cli()
    if not cli_path:
        return {
            "success": False,
            "message": "Proton Pass CLI not found. Install `pass-cli` first.",
        }

    try:
        result = subprocess.run(
            [cli_path, "logout"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        logger.error("Proton Pass logout error: %s", e, exc_info=True)
        return {"success": False, "message": f"Logout error: {e}"}

    if result.returncode == 0:
        return {"success": True, "message": "Successfully logged out of Proton Pass"}

    error_message = result.stderr.strip() or result.stdout.strip() or "Logout failed"
    return {"success": False, "message": error_message}


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

    await app_settings.save_changes()
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
