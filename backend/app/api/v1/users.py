"""User preference endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.user import User

router = APIRouter()


class UserPreferences(BaseModel):
    default_symbol: str
    default_timeframe: str


class UserPreferencesUpdate(BaseModel):
    default_symbol: str | None = None
    default_timeframe: str | None = None


@router.get("/me/preferences", response_model=UserPreferences)
async def get_preferences(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Return the current user's trading preferences."""
    return {
        "default_symbol": current_user.default_symbol,
        "default_timeframe": current_user.default_timeframe,
    }


@router.put("/me/preferences", response_model=UserPreferences)
async def update_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Update the current user's trading preferences."""
    if body.default_symbol is not None:
        current_user.default_symbol = body.default_symbol
    if body.default_timeframe is not None:
        current_user.default_timeframe = body.default_timeframe
    current_user.update_timestamp()
    await current_user.save()
    return {
        "default_symbol": current_user.default_symbol,
        "default_timeframe": current_user.default_timeframe,
    }
