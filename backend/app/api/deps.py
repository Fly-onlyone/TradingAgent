"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException

from app.api.v1.auth import get_current_active_user
from app.db.models.user import User


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure current user is a superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Superuser privileges required",
        )
    return current_user
