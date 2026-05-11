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


async def require_emergency_stop_off() -> None:
    """Refuse the request while the global emergency-stop latch is set."""
    from app.agent.task_scheduler import EMERGENCY_STOP_MESSAGE, is_emergency_stopped

    if await is_emergency_stopped():
        raise HTTPException(status_code=409, detail=EMERGENCY_STOP_MESSAGE)
