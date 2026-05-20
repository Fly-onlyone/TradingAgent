---
tags: [backend, services, notifications]
---

# Notification Service

> Single entry point for all in-app + Web Push + desktop toast notifications.

## Source

- `backend/app/services/notification_service.py`

## How it works

`NotificationService.create_notification(...)` is the canonical fan-out used by every service that wants to notify the user. It:

1. Inserts a [[Notification Model]] document with `decision_id`, `task_id`, `order_id`, `session_id` deep-link fields.
2. Calls `_send_web_push()` — checks `UserNotificationSettings.web_push_subscription`, calls `pywebpush.webpush()` with the configured VAPID keys, marks delivered/failed.
3. Calls `_send_desktop_toast()` which short-circuits on `AppSettings.native_notifications_enabled=False`, otherwise runs [[Desktop Toast Pipeline]] inside `asyncio.to_thread()` to avoid blocking the event loop.

`take_action()` routes `CONFIRMED` trade-confirmation taps to [[Agent Execution Service]] via `get_agent_execution_service().confirm_and_execute_decision(source="notification")`, and `REJECTED` taps directly mark the decision rejected. Accessed via `get_notification_service()` singleton.

## Depends on

- [[Notification Model]]
- [[Desktop Toast Pipeline]]
- [[Agent Execution Service]]
- `pywebpush`

## Used by

- [[Strategy Discovery Service]]
- [[Agent WS Channel]] (ANALYSIS_READY)
- [[Task Scheduler]]
- [[Notifications Endpoints]]

## Gotchas

- VAPID keys are configured at startup via `configure_vapid()` — Web Push is silently disabled when missing.

## See also

- [[_index]]
- [[Chat-Session Checklist]]
