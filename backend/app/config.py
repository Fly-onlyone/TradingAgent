"""Application configuration using Pydantic settings."""

import os
import secrets
import warnings
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_db_name() -> str:
    """Derive the default MongoDB database name from the runtime context.

    Priority: MONGODB_DB_NAME env var > TAURI_APP detection > dev default.
    """
    if os.environ.get("MONGODB_DB_NAME"):
        return os.environ["MONGODB_DB_NAME"]
    if os.environ.get("TAURI_APP"):
        return "trading_agent"
    return "trading_agent_dev"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Trading Agent"
    debug: bool = False
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 0
    allow_debug_auth_bypass: bool = False

    # CORS
    cors_origins: str = ""

    # MongoDB
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = _default_db_name()

    # OKX API
    okx_api_key: str = ""
    okx_secret_key: str = ""
    okx_passphrase: str = ""
    okx_sandbox: bool = True

    # Claude AI
    # If set, the Agent SDK uses this API key for billing.
    # If empty, falls back to Claude Code CLI credentials (requires `claude login`).
    anthropic_api_key: str = ""

    # App-managed secret encryption
    # Comma-separated Fernet keys (first encrypts, all decrypt).
    secrets_encryption_keys: str = ""

    # OpenAI (for embeddings) — env-var-only, not covered by DB encryption
    openai_api_key: str = ""

    # External Data APIs — env-var-only, not covered by DB encryption
    glassnode_api_key: str = ""
    coingecko_api_key: str = ""
    defillama_api_url: str = "https://api.llama.fi"
    brave_search_api_key: str = ""

    # Sentry
    sentry_dsn: str = ""
    sentry_environment: str = ""
    sentry_release: str = ""
    sentry_traces_sample_rate: float = 0.1
    sentry_profiles_sample_rate: float = 0.1
    sentry_enable_logs: bool = True

    # Logging
    log_level: str = "INFO"
    log_dir: str = "logs"
    log_max_bytes: int = 10 * 1024 * 1024  # 10 MB
    log_backup_count: int = 5

    # Trading Settings
    max_position_size_pct: float = 5.0  # Max % of portfolio per trade
    default_stop_loss_pct: float = 2.0
    default_take_profit_pct: float = 6.0

    @model_validator(mode="after")
    def _validate_security(self) -> "Settings":
        if not self.secret_key or self.secret_key == "change-me-in-production":
            if not self.debug:
                raise ValueError(
                    "SECRET_KEY is required and must not use placeholder values in non-debug mode. "
                    "Set a strong SECRET_KEY in your .env file before running in production."
                )
            self.secret_key = secrets.token_urlsafe(48)
            warnings.warn(
                "SECRET_KEY was missing in debug mode; generated an ephemeral in-memory key.",
                UserWarning,
                stacklevel=2,
            )

        if not self.debug and "localhost" in self.mongodb_url and "@" not in self.mongodb_url:
            warnings.warn(
                "MongoDB connection has no authentication credentials. "
                "Configure a URI with username:password@ for production.",
                UserWarning,
                stacklevel=2,
            )

        for field_name in (
            "sentry_traces_sample_rate",
            "sentry_profiles_sample_rate",
        ):
            value = getattr(self, field_name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{field_name} must be between 0.0 and 1.0")

        return self

    @property
    def okx_base_url(self) -> str:
        """Get OKX API base URL based on sandbox mode."""
        return "https://www.okx.com"

    @property
    def okx_ws_url(self) -> str:
        """Get OKX WebSocket URL based on sandbox mode."""
        if self.okx_sandbox:
            return "wss://wspap.okx.com:8443/ws/v5"
        return "wss://ws.okx.com:8443/ws/v5"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
