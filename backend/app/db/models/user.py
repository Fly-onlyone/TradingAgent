"""User model for MongoDB."""

from datetime import UTC, datetime

from beanie import Document, Indexed
from pydantic import EmailStr, Field


class User(Document):
    """User account document."""

    email: Indexed(EmailStr, unique=True)  # type: ignore[valid-type]
    hashed_password: str
    full_name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    default_symbol: str = "BTC-USDT"
    default_timeframe: str = "1h"
    password_changed_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "users"
        use_state_management = True

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now(UTC)
