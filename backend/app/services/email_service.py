"""Email service for transactional emails (password reset, verification)."""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("SMTP_FROM", "noreply@tradingagent.local")
        self.enabled = bool(self.smtp_host and self.smtp_user)

    async def send_email(self, to: str, subject: str, html_body: str) -> bool:
        """Send an HTML email. Logs instead of sending when SMTP is not configured."""
        if not self.enabled:
            logger.info(
                "Email not configured — logging instead:\n  To: %s\n  Subject: %s\n  Body: %s",
                to,
                subject,
                html_body,
            )
            return True
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.from_email
            msg["To"] = to
            msg.attach(MIMEText(html_body, "html"))
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            return True
        except Exception:
            logger.exception("Failed to send email to %s", to)
            return False

    async def send_password_reset(self, to: str, token: str, base_url: str = "") -> bool:
        """Send a password-reset email with a 1-hour expiry notice."""
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        reset_link = f"{frontend_url}/auth/reset-password?token={token}"
        html = (
            "<h2>Password Reset</h2>"
            "<p>Click the link below to reset your password. "
            "This link expires in 1 hour.</p>"
            f"<p><a href='{reset_link}'>Reset Password</a></p>"
            "<p>If you didn't request this, ignore this email.</p>"
        )
        return await self.send_email(to, "Password Reset Request", html)

    async def send_email_verification(self, to: str, token: str) -> bool:
        """Send an email-verification link."""
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        verify_link = f"{frontend_url}/auth/verify-email?token={token}"
        html = (
            "<h2>Verify Your Email</h2>"
            "<p>Click the link below to verify your email address.</p>"
            f"<p><a href='{verify_link}'>Verify Email</a></p>"
        )
        return await self.send_email(to, "Verify Your Email", html)
