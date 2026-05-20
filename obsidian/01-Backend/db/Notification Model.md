---
tags: [backend, db, model]
---

# Notification Model

> Per-user push notification with delivery state, optional FK to a decision/task/order/session, and Web Push endpoint tracking.

## Source

- `backend/app/db/models/notification.py` — `Notification`
- Collection: `notifications`

## Key fields

- `user_id`, `title`, `body`, `notification_type` (`NotificationType`)
- FKs: `decision_id`, `task_id`, `order_id`, `session_id`
- `data: dict` (payload — symbol, action, …)
- `status: NotificationStatus` (`pending`/`delivered`/`read`/`actioned`/`expired`/`failed`)
- Delivery: `delivered_at`, `delivery_error`, `push_sent`, `push_endpoint`
- Interaction: `read_at`, `action_taken`, `action_taken_at`, `action_comment`
- `expires_at`

## Used by

- [[Notification Service]]
- Desktop toast hook (`desktop_notify._send_desktop_toast`)
- ASK-mode confirmation deep-links

## Special features

- Helpers: `mark_delivered()`, `mark_read()`, `take_action()`, `mark_expired()`, `mark_failed()`
- Multiple compound indexes for user-feed pagination + status sweeps

## See also

- [[_index]]
- [[UserNotificationSettings Model]]
- [[AgentDecision Model]]
