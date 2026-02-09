"""Settings endpoints for agent configuration (superuser only)."""

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

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
    auth_mode: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    max_thinking_tokens: Optional[int] = None


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
    return app_settings.agent_api_key or settings.anthropic_api_key


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
        app_settings.agent_api_key = body.api_key

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
            response = client.messages.create(
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
    import shutil

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
