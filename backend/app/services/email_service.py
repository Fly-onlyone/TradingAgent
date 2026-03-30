"""Notification service using Apprise for multi-channel delivery.

Supports 80+ notification services (Telegram, Discord, Slack, email, webhooks, etc.)
via URL-based configuration. See https://github.com/caronc/apprise/wiki for all services.
"""

import asyncio
import logging
import os

import apprise

logger = logging.getLogger(__name__)


async def _load_urls_from_db() -> tuple[list[str], str]:
    """Load notification URLs from AppSettings, returning (urls, email_url).

    Returns empty defaults if the DB is not yet available (e.g. during startup).
    """
    try:
        from app.db.models.app_settings import AppSettings

        settings = await AppSettings.get_instance()
        urls = settings.get_notification_urls()
        email_url = settings.get_email_url()
        return urls, email_url
    except Exception:  # noqa: BLE001
        return [], ""


class NotifyService:
    """Multi-channel notification service backed by Apprise.

    Resolves URLs from AppSettings (DB) first, then falls back to env vars:
    - ``NOTIFICATION_URLS``: broadcast channels (Telegram, Discord, Slack, etc.)
    - ``EMAIL_URL``: transactional email channel (``mailto://`` scheme)

    When no URLs are configured, notifications are logged to console (dev mode).
    """

    def __init__(self):
        raw_urls = os.getenv("NOTIFICATION_URLS", "")
        self._env_notification_urls: list[str] = [
            u.strip() for u in raw_urls.split(",") if u.strip()
        ]
        self._env_email_url: str = os.getenv("EMAIL_URL", "").strip()
        self.frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

        # Cached DB values (populated by resolve())
        self._db_resolved = False
        self._db_notification_urls: list[str] = []
        self._db_email_url: str = ""

    async def _resolve_from_db(self) -> None:
        """Lazily load URLs from AppSettings on first use."""
        if self._db_resolved:
            return
        self._db_notification_urls, self._db_email_url = await _load_urls_from_db()
        self._db_resolved = True

    @property
    def notification_urls(self) -> list[str]:
        """Return DB URLs if available, otherwise env var fallback."""
        if self._db_resolved and self._db_notification_urls:
            return self._db_notification_urls
        return self._env_notification_urls

    @property
    def email_url(self) -> str:
        """Return DB email URL if available, otherwise env var fallback."""
        if self._db_resolved and self._db_email_url:
            return self._db_email_url
        return self._env_email_url

    async def broadcast(self, title: str, body: str, notify_type: str = "info") -> bool:
        """Send a notification to ALL configured channels."""
        await self._resolve_from_db()
        if not self.notification_urls:
            logger.info(
                "No NOTIFICATION_URLS configured — logging instead:\n  Title: %s\n  Body: %s",
                title,
                body,
            )
            return True
        return await self._send(self.notification_urls, title, body, notify_type)

    async def notify(self, title: str, body: str, notify_type: str = "info") -> bool:
        """Alias for broadcast — send to all configured notification channels."""
        return await self.broadcast(title, body, notify_type)

    async def send_password_reset(self, to: str, token: str, base_url: str = "") -> bool:
        """Send a password-reset notification to a specific email address."""
        reset_link = f"{self.frontend_url}/auth/reset-password?token={token}"
        title = "Password Reset Request"
        body = (
            "Password Reset\n\n"
            "Click the link below to reset your password. "
            "This link expires in 1 hour.\n\n"
            f"{reset_link}\n\n"
            "If you didn't request this, ignore this message."
        )
        return await self._send_email(to, title, body)

    async def send_email_verification(self, to: str, token: str) -> bool:
        """Send an email-verification notification to a specific email address."""
        verify_link = f"{self.frontend_url}/auth/verify-email?token={token}"
        title = "Verify Your Email"
        body = (
            "Verify Your Email\n\n"
            "Click the link below to verify your email address.\n\n"
            f"{verify_link}"
        )
        return await self._send_email(to, title, body)

    async def _send_email(self, to: str, title: str, body: str) -> bool:
        """Send a transactional email to a specific recipient.

        Constructs a targeted ``mailto://`` URL from EMAIL_URL with the recipient
        address appended. Falls back to console logging when EMAIL_URL is not set.
        """
        await self._resolve_from_db()
        if not self.email_url:
            logger.info(
                "No EMAIL_URL configured — logging instead:\n  To: %s\n  Title: %s\n  Body: %s",
                to,
                title,
                body,
            )
            return True

        # Build a recipient-specific mailto URL by appending ?to=<address>
        separator = "&" if "?" in self.email_url else "?"
        targeted_url = f"{self.email_url}{separator}to={to}"
        return await self._send([targeted_url], title, body, "info")

    async def _send(
        self, urls: list[str], title: str, body: str, notify_type: str = "info"
    ) -> bool:
        """Create an Apprise instance, add URLs, and send synchronously via executor."""
        ap = apprise.Apprise()
        for url in urls:
            ap.add(url)

        nt = getattr(apprise.NotifyType, notify_type.upper(), apprise.NotifyType.INFO)

        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: ap.notify(title=title, body=body, notify_type=nt),
            )
            return bool(result)
        except Exception:
            logger.exception("Failed to send notification: %s", title)
            return False


# Backward-compatible alias
EmailService = NotifyService
