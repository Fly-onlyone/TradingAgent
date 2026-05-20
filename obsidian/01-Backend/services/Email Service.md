---
tags: [backend, services, notifications]
---

# Email Service

> Apprise-backed multi-channel notify transport — Telegram, Discord, Slack, email, webhooks, etc. via URL config.

## Source

- `backend/app/services/email_service.py`

## How it works

`NotifyService` (alias `EmailService`) wraps Apprise. URLs come from [[AppSettings Model]] first (`get_notification_urls()` / `get_email_url()`) and fall back to env vars `NOTIFICATION_URLS` / `EMAIL_URL`. On first use `_resolve_from_db()` lazily caches DB values to avoid hitting the DB on every send.

- `broadcast(title, body)` — fanout to all configured channels.
- `_send_email(to, ...)` — appends `?to=<address>` to the configured `mailto://` URL for targeted transactional mail.
- `send_password_reset()` / `send_email_verification()` — render a deep-link URL built from `FRONTEND_URL` (or empty for desktop deployments) and dispatch via `_send_email()`.

Apprise calls are pushed through `loop.run_in_executor` since `ap.notify()` is synchronous. When no URLs are set the service logs the message instead and returns `True` so dev flows don't break.

## Depends on

- `apprise`
- [[AppSettings Model]]

## Used by

- [[Auth Endpoints]] (password reset, email verification)

## See also

- [[_index]]
- [[Notification Service]] (separate stack — in-app + Web Push + desktop)
