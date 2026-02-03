"""Application configuration using Pydantic settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # MongoDB
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "trading_agent"

    # OKX API
    okx_api_key: str = ""
    okx_secret_key: str = ""
    okx_passphrase: str = ""
    okx_sandbox: bool = True

    # Claude AI
    anthropic_api_key: str = ""

    # OpenAI (for embeddings)
    openai_api_key: str = ""

    # External Data APIs
    glassnode_api_key: str = ""
    coingecko_api_key: str = ""
    defillama_api_url: str = "https://api.llama.fi"

    # Trading Settings
    max_position_size_pct: float = 5.0  # Max % of portfolio per trade
    default_stop_loss_pct: float = 2.0
    default_take_profit_pct: float = 6.0

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
