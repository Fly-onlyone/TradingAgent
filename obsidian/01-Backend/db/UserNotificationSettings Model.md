---
tags: [backend, db, model]
---

# UserNotificationSettings Model

> Per-user preferences for Web Push delivery: subscription object, per-type toggles, and quiet-hours window.

## Source

- `backend/app/db/models/notification.py` — `UserNotificationSettings`
- Collection: `user_notification_settings`

## Key fields

- `user_id` (unique indexed)
- `web_push_enabled`, `web_push_subscription` (dict: `endpoint` + `keys.p256dh` + `keys.auth`)
- Toggles: `trade_confirmations`, `trade_executions`, `risk_alerts`, `task_completions`, `price_alerts`, `analysis_ready`
- Quiet hours: `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`, `quiet_hours_timezone`

## Used by

- [[Notification Service]] — `should_notify(type)` gate before Web Push send
- Settings UI on the frontend

## Special features

- `update_subscription()` / `remove_subscription()` flip Web Push on/off atomically
- `should_notify()` maps `NotificationType` → per-type toggle and respects the global `web_push_enabled` switch

## See also

- [[_index]]
- [[Notification Model]]
