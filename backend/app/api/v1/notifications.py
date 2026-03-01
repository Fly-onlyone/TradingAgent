"""Notification management endpoints."""

from datetime import UTC, datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.auth import get_current_active_user
from app.db.models.notification import (
    Notification,
    NotificationAction,
    NotificationType,
)
from app.db.models.user import User
from app.services.notification_service import get_notification_service

router = APIRouter()


# Request/Response schemas
class NotificationResponse(BaseModel):
    id: str
    title: str
    body: str
    notification_type: str
    decision_id: str | None
    task_id: str | None
    order_id: str | None
    data: dict
    status: str
    read_at: datetime | None
    action_taken: str | None
    action_taken_at: datetime | None
    created_at: datetime
    expires_at: datetime | None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Paginated notification list response."""

    notifications: list[NotificationResponse]
    total: int
    unread_count: int
    page: int
    page_size: int


class NotificationSettingsResponse(BaseModel):
    """Notification settings response."""

    web_push_enabled: bool
    has_subscription: bool
    trade_confirmations: bool
    trade_executions: bool
    risk_alerts: bool
    task_completions: bool
    price_alerts: bool
    analysis_ready: bool
    quiet_hours_enabled: bool
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    quiet_hours_timezone: str


class NotificationSettingsUpdate(BaseModel):
    """Update notification settings."""

    trade_confirmations: bool | None = None
    trade_executions: bool | None = None
    risk_alerts: bool | None = None
    task_completions: bool | None = None
    price_alerts: bool | None = None
    analysis_ready: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    quiet_hours_timezone: str | None = None


class WebPushSubscription(BaseModel):
    """Web Push subscription from browser."""

    endpoint: str
    keys: dict  # {p256dh: str, auth: str}


class ActionRequest(BaseModel):
    """Action on notification."""

    action: NotificationAction
    comment: str | None = None


def notification_to_response(notification: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(notification.id),
        title=notification.title,
        body=notification.body,
        notification_type=notification.notification_type.value,
        decision_id=str(notification.decision_id) if notification.decision_id else None,
        task_id=str(notification.task_id) if notification.task_id else None,
        order_id=str(notification.order_id) if notification.order_id else None,
        data=notification.data,
        status=notification.status.value,
        read_at=notification.read_at,
        action_taken=(notification.action_taken.value if notification.action_taken else None),
        action_taken_at=notification.action_taken_at,
        created_at=notification.created_at,
        expires_at=notification.expires_at,
    )


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = False,
    notification_type: NotificationType | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List user notifications."""
    service = get_notification_service()

    notifications, total = await service.get_user_notifications(
        user_id=current_user.id,
        unread_only=unread_only,
        page=page,
        page_size=page_size,
    )

    if notification_type:
        notifications = [n for n in notifications if n.notification_type == notification_type]

    unread_count = await service.get_unread_count(current_user.id)

    return {
        "notifications": [notification_to_response(n) for n in notifications],
        "total": total,
        "unread_count": unread_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get count of unread notifications."""
    service = get_notification_service()
    count = await service.get_unread_count(current_user.id)
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_active_user),
) -> NotificationResponse:
    """Mark a notification as read."""
    service = get_notification_service()

    notification = await service.mark_as_read(
        notification_id=PydanticObjectId(notification_id),
        user_id=current_user.id,
    )

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return notification_to_response(notification)


@router.post("/{notification_id}/action")
async def take_action(
    notification_id: str,
    action_request: ActionRequest,
    current_user: User = Depends(get_current_active_user),
) -> NotificationResponse:
    """Take action on a notification (confirm/reject trade)."""
    service = get_notification_service()

    notification = await service.take_action(
        notification_id=PydanticObjectId(notification_id),
        user_id=current_user.id,
        action=action_request.action,
        comment=action_request.comment,
    )

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return notification_to_response(notification)


@router.get("/settings", response_model=NotificationSettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_active_user),
) -> NotificationSettingsResponse:
    """Get notification settings."""
    service = get_notification_service()
    settings = await service.get_user_settings(current_user.id)

    return NotificationSettingsResponse(
        web_push_enabled=settings.web_push_enabled,
        has_subscription=settings.web_push_subscription is not None,
        trade_confirmations=settings.trade_confirmations,
        trade_executions=settings.trade_executions,
        risk_alerts=settings.risk_alerts,
        task_completions=settings.task_completions,
        price_alerts=settings.price_alerts,
        analysis_ready=settings.analysis_ready,
        quiet_hours_enabled=settings.quiet_hours_enabled,
        quiet_hours_start=settings.quiet_hours_start,
        quiet_hours_end=settings.quiet_hours_end,
        quiet_hours_timezone=settings.quiet_hours_timezone,
    )


@router.put("/settings", response_model=NotificationSettingsResponse)
async def update_settings(
    settings_update: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
) -> NotificationSettingsResponse:
    """Update notification settings."""
    service = get_notification_service()
    settings = await service.get_user_settings(current_user.id)

    # Update fields
    update_data = settings_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    settings.updated_at = datetime.now(UTC)
    await settings.save()

    return NotificationSettingsResponse(
        web_push_enabled=settings.web_push_enabled,
        has_subscription=settings.web_push_subscription is not None,
        trade_confirmations=settings.trade_confirmations,
        trade_executions=settings.trade_executions,
        risk_alerts=settings.risk_alerts,
        task_completions=settings.task_completions,
        price_alerts=settings.price_alerts,
        analysis_ready=settings.analysis_ready,
        quiet_hours_enabled=settings.quiet_hours_enabled,
        quiet_hours_start=settings.quiet_hours_start,
        quiet_hours_end=settings.quiet_hours_end,
        quiet_hours_timezone=settings.quiet_hours_timezone,
    )


@router.post("/subscribe")
async def subscribe_to_push(
    subscription: WebPushSubscription,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Subscribe to Web Push notifications."""
    service = get_notification_service()

    await service.update_subscription(
        user_id=current_user.id,
        subscription={
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
        },
    )

    return {"message": "Subscribed to push notifications"}


@router.post("/unsubscribe")
async def unsubscribe_from_push(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Unsubscribe from Web Push notifications."""
    service = get_notification_service()
    await service.remove_subscription(current_user.id)
    return {"message": "Unsubscribed from push notifications"}


@router.get("/vapid-public-key")
async def get_vapid_public_key() -> dict:
    """Get VAPID public key for client-side subscription."""
    service = get_notification_service()
    public_key = service.vapid_public_key

    if not public_key:
        raise HTTPException(
            status_code=503,
            detail="Web Push not configured",
        )

    return {"publicKey": public_key}
