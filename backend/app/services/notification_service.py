"""Notification service for Web Push and in-app notifications."""

import json
import logging
from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId

from app.config import get_settings
from app.db.models.agent_decision import AgentDecision
from app.db.models.notification import (
    Notification,
    NotificationAction,
    NotificationType,
    UserNotificationSettings,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class NotificationService:
    """Service for managing notifications and Web Push delivery."""

    def __init__(self) -> None:
        self._vapid_private_key: Optional[str] = None
        self._vapid_public_key: Optional[str] = None
        self._vapid_claims: Optional[dict] = None

    def configure_vapid(
        self,
        private_key: str,
        public_key: str,
        claims_email: str,
    ) -> None:
        """Configure VAPID keys for Web Push."""
        self._vapid_private_key = private_key
        self._vapid_public_key = public_key
        self._vapid_claims = {"sub": f"mailto:{claims_email}"}

    @property
    def vapid_public_key(self) -> Optional[str]:
        """Get the VAPID public key for client subscription."""
        return self._vapid_public_key

    async def get_user_settings(self, user_id: PydanticObjectId) -> UserNotificationSettings:
        """Get or create user notification settings."""
        settings = await UserNotificationSettings.find_one(
            UserNotificationSettings.user_id == user_id
        )
        if not settings:
            settings = UserNotificationSettings(user_id=user_id)
            await settings.insert()
        return settings

    async def update_subscription(
        self,
        user_id: PydanticObjectId,
        subscription: dict,
    ) -> UserNotificationSettings:
        """Update Web Push subscription for a user."""
        user_settings = await self.get_user_settings(user_id)
        user_settings.update_subscription(subscription)
        await user_settings.save()
        logger.info(f"Updated Web Push subscription for user {user_id}")
        return user_settings

    async def remove_subscription(
        self,
        user_id: PydanticObjectId,
    ) -> UserNotificationSettings:
        """Remove Web Push subscription for a user."""
        user_settings = await self.get_user_settings(user_id)
        user_settings.remove_subscription()
        await user_settings.save()
        logger.info(f"Removed Web Push subscription for user {user_id}")
        return user_settings

    async def create_notification(
        self,
        user_id: PydanticObjectId,
        title: str,
        body: str,
        notification_type: NotificationType,
        decision_id: Optional[PydanticObjectId] = None,
        task_id: Optional[PydanticObjectId] = None,
        order_id: Optional[PydanticObjectId] = None,
        session_id: Optional[PydanticObjectId] = None,
        data: Optional[dict] = None,
        expires_at: Optional[datetime] = None,
    ) -> Notification:
        """Create a new notification."""
        notification = Notification(
            user_id=user_id,
            title=title,
            body=body,
            notification_type=notification_type,
            decision_id=decision_id,
            task_id=task_id,
            order_id=order_id,
            session_id=session_id,
            data=data or {},
            expires_at=expires_at,
        )
        await notification.insert()
        logger.info(f"Created {notification_type.value} notification for user {user_id}")

        # Try to send Web Push
        await self._send_web_push(user_id, notification)

        return notification

    async def _send_web_push(
        self,
        user_id: PydanticObjectId,
        notification: Notification,
    ) -> bool:
        """Send Web Push notification to user."""
        if not self._vapid_private_key:
            logger.warning("VAPID keys not configured, skipping Web Push")
            return False

        user_settings = await self.get_user_settings(user_id)

        if not user_settings.should_notify(notification.notification_type):
            logger.info(f"User {user_id} has disabled {notification.notification_type}")
            return False

        if not user_settings.web_push_subscription:
            logger.info(f"User {user_id} has no Web Push subscription")
            return False

        try:
            from pywebpush import webpush, WebPushException

            subscription = user_settings.web_push_subscription
            payload = json.dumps(
                {
                    "title": notification.title,
                    "body": notification.body,
                    "type": notification.notification_type.value,
                    "data": {
                        "notificationId": str(notification.id),
                        "decisionId": (
                            str(notification.decision_id) if notification.decision_id else None
                        ),
                        **notification.data,
                    },
                }
            )

            webpush(
                subscription_info=subscription,
                data=payload,
                vapid_private_key=self._vapid_private_key,
                vapid_claims=self._vapid_claims,
            )

            notification.mark_delivered()
            notification.push_endpoint = subscription.get("endpoint")
            await notification.save()

            logger.info(f"Sent Web Push to user {user_id}")
            return True

        except ImportError:
            logger.warning("pywebpush not installed, skipping Web Push")
            return False
        except Exception as e:
            logger.error(f"Failed to send Web Push: {e}")
            notification.mark_failed(str(e))
            await notification.save()
            return False

    async def get_user_notifications(
        self,
        user_id: PydanticObjectId,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Notification], int]:
        """Get notifications for a user."""
        query = Notification.find(Notification.user_id == user_id)

        if unread_only:
            query = query.find(Notification.read_at == None)  # noqa: E711

        total = await query.count()

        notifications = (
            await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
        )

        return notifications, total

    async def mark_as_read(
        self,
        notification_id: PydanticObjectId,
        user_id: PydanticObjectId,
    ) -> Optional[Notification]:
        """Mark a notification as read."""
        notification = await Notification.find_one(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        if notification:
            notification.mark_read()
            await notification.save()
        return notification

    async def take_action(
        self,
        notification_id: PydanticObjectId,
        user_id: PydanticObjectId,
        action: NotificationAction,
        comment: Optional[str] = None,
    ) -> Optional[Notification]:
        """Take action on a notification (confirm/reject trade)."""
        notification = await Notification.find_one(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        if not notification:
            return None

        notification.take_action(action, comment)
        await notification.save()

        # If this is a trade confirmation, update the decision
        if notification.notification_type == NotificationType.TRADE_CONFIRMATION:
            await self._handle_trade_confirmation_action(notification, action)

        return notification

    async def _handle_trade_confirmation_action(
        self,
        notification: Notification,
        action: NotificationAction,
    ) -> None:
        """Handle trade confirmation action."""
        if not notification.decision_id:
            return

        decision = await AgentDecision.get(notification.decision_id)
        if not decision:
            return

        if action == NotificationAction.CONFIRMED:
            from app.services.agent_execution_service import get_agent_execution_service

            service = get_agent_execution_service()
            try:
                await service.confirm_and_execute_decision(
                    decision_id=decision.id,
                    user_id=notification.user_id,
                    source="notification",
                )
            except Exception as exc:
                logger.error("Failed to confirm and execute decision %s: %s", decision.id, exc)

        elif action == NotificationAction.REJECTED:
            decision.reject()
            await decision.save()
            logger.info(f"User rejected decision {decision.id}")

    async def get_unread_count(self, user_id: PydanticObjectId) -> int:
        """Get count of unread notifications for a user."""
        return await Notification.find(
            Notification.user_id == user_id,
            Notification.read_at == None,  # noqa: E711
        ).count()


# Global service instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get the global notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
