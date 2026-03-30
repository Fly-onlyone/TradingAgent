"""Notification models for push notifications and user preferences."""

from datetime import UTC, datetime
from enum import Enum

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class NotificationType(str, Enum):
    """Type of notification."""

    TRADE_CONFIRMATION = "trade_confirmation"  # ASK mode - confirm trade
    TRADE_EXECUTED = "trade_executed"  # Trade was executed
    RISK_ALERT = "risk_alert"  # Risk warning
    TASK_COMPLETED = "task_completed"  # Scheduled task finished
    TASK_FAILED = "task_failed"  # Scheduled task failed
    PRICE_ALERT = "price_alert"  # Price reached target
    ANALYSIS_READY = "analysis_ready"  # Analysis complete
    TASK_MODIFICATION_PROPOSED = "task_modification_proposed"  # Agent proposed task changes
    TASK_MODIFICATION_APPLIED = "task_modification_applied"  # Task changes applied
    STRATEGY_DISCOVERED = "strategy_discovered"  # Auto-discovered strategy from news


class NotificationStatus(str, Enum):
    """Notification delivery and action status."""

    PENDING = "pending"  # Not yet delivered
    DELIVERED = "delivered"  # Sent to user
    READ = "read"  # User viewed it
    ACTIONED = "actioned"  # User took action
    EXPIRED = "expired"  # Confirmation timeout
    FAILED = "failed"  # Delivery failed


class NotificationAction(str, Enum):
    """Action taken on notification."""

    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    DISMISSED = "dismissed"


class Notification(Document):
    """User notification document."""

    user_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]

    # Notification content
    title: str
    body: str
    notification_type: NotificationType  # Index defined in Settings

    # Related entities
    decision_id: PydanticObjectId | None = None
    task_id: PydanticObjectId | None = None
    order_id: PydanticObjectId | None = None
    session_id: PydanticObjectId | None = None

    # Additional data for the notification
    data: dict = Field(default_factory=dict)
    # e.g., {symbol, action, confidence, suggested_entry, suggested_stop_loss}

    # Status tracking
    status: NotificationStatus = NotificationStatus.PENDING

    # Delivery tracking
    delivered_at: datetime | None = None
    delivery_error: str | None = None

    # User interaction
    read_at: datetime | None = None
    action_taken: NotificationAction | None = None
    action_taken_at: datetime | None = None
    action_comment: str | None = None

    # Web Push specific
    push_sent: bool = False
    push_endpoint: str | None = None  # Which subscription received it

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None  # For confirmations

    class Settings:
        name = "notifications"
        use_state_management = True
        indexes = [
            "notification_type",
            "decision_id",
            IndexModel(
                [("created_at", DESCENDING)],
                name="notifications_created_desc",
            ),
            IndexModel(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                name="notif_user_created_desc",
            ),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("read_at", ASCENDING),
                    ("created_at", DESCENDING),
                ],
                name="notif_user_read_created_desc",
            ),
            IndexModel(
                [("status", ASCENDING), ("expires_at", ASCENDING)],
                name="notif_status_expires",
            ),
        ]

    def mark_delivered(self) -> None:
        """Mark notification as delivered."""
        self.status = NotificationStatus.DELIVERED
        self.delivered_at = datetime.now(UTC)
        self.push_sent = True

    def mark_read(self) -> None:
        """Mark notification as read."""
        if self.status == NotificationStatus.DELIVERED:
            self.status = NotificationStatus.READ
        self.read_at = datetime.now(UTC)

    def take_action(self, action: NotificationAction, comment: str | None = None) -> None:
        """Record user action on notification."""
        self.status = NotificationStatus.ACTIONED
        self.action_taken = action
        self.action_taken_at = datetime.now(UTC)
        self.action_comment = comment

    def mark_expired(self) -> None:
        """Mark notification as expired."""
        self.status = NotificationStatus.EXPIRED

    def mark_failed(self, error: str) -> None:
        """Mark delivery as failed."""
        self.status = NotificationStatus.FAILED
        self.delivery_error = error


class UserNotificationSettings(Document):
    """User notification preferences."""

    user_id: Indexed(PydanticObjectId, unique=True)  # type: ignore[valid-type]

    # Web Push configuration
    web_push_enabled: bool = True
    web_push_subscription: dict | None = None
    # Subscription object: {endpoint, keys: {p256dh, auth}}

    # Notification type preferences
    trade_confirmations: bool = True  # ASK mode trade confirmations
    trade_executions: bool = True  # Notify when trades execute
    risk_alerts: bool = True  # Risk warnings
    task_completions: bool = True  # Scheduled task results
    price_alerts: bool = True  # Price target notifications
    analysis_ready: bool = True  # Analysis completion

    # Quiet hours (don't send notifications)
    quiet_hours_enabled: bool = False
    quiet_hours_start: str | None = None  # HH:MM
    quiet_hours_end: str | None = None  # HH:MM
    quiet_hours_timezone: str = "UTC"

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "user_notification_settings"
        use_state_management = True

    def update_subscription(self, subscription: dict) -> None:
        """Update Web Push subscription."""
        self.web_push_subscription = subscription
        self.web_push_enabled = True
        self.updated_at = datetime.now(UTC)

    def remove_subscription(self) -> None:
        """Remove Web Push subscription."""
        self.web_push_subscription = None
        self.web_push_enabled = False
        self.updated_at = datetime.now(UTC)

    def should_notify(self, notification_type: NotificationType) -> bool:
        """Check if user should receive this notification type."""
        if not self.web_push_enabled:
            return False

        type_map = {
            NotificationType.TRADE_CONFIRMATION: self.trade_confirmations,
            NotificationType.TRADE_EXECUTED: self.trade_executions,
            NotificationType.RISK_ALERT: self.risk_alerts,
            NotificationType.TASK_COMPLETED: self.task_completions,
            NotificationType.TASK_FAILED: self.task_completions,
            NotificationType.PRICE_ALERT: self.price_alerts,
            NotificationType.ANALYSIS_READY: self.analysis_ready,
        }
        return type_map.get(notification_type, True)
