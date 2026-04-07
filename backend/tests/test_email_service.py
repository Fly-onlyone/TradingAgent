"""Tests for desktop-safe frontend link generation in notification emails."""

from __future__ import annotations

import pytest
from app.services.email_service import NotifyService


def test_desktop_email_service_does_not_default_to_localhost(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.delenv("FRONTEND_URL", raising=False)

    service = NotifyService()

    assert service.frontend_url == ""
    assert service._build_frontend_link("/auth/reset-password", "token") is None


@pytest.mark.asyncio
async def test_send_password_reset_includes_configuration_hint_without_frontend_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TAURI_APP", "1")
    monkeypatch.delenv("FRONTEND_URL", raising=False)

    service = NotifyService()
    captured: dict[str, str] = {}

    async def _capture_email(to: str, title: str, body: str) -> bool:
        captured["to"] = to
        captured["title"] = title
        captured["body"] = body
        return True

    monkeypatch.setattr(service, "_send_email", _capture_email)

    result = await service.send_password_reset("user@example.com", "abc123")

    assert result is True
    assert captured["title"] == "Password Reset Request"
    assert "FRONTEND_URL" in captured["body"]
    assert "http://localhost:3000" not in captured["body"]
