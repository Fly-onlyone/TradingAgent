---
tags: [backend, api, notifications]
---

# Notifications Endpoints

> User-facing list/read/action endpoints + Web Push subscription management under `/notifications`.

## Source

- `backend/app/api/v1/notifications.py`

## How it works

Notifications are written by [[Notification Service]]. This router only reads + actions them. `POST /{id}/action` routes `CONFIRMED`/`REJECTED` through the service's `take_action()` (which for trade-confirmations calls [[Agent Execution Service]]). `/settings` reads + writes `UserNotificationSettings` (category toggles). `/subscribe` + `/unsubscribe` save the browser's `pushSubscription` JSON for Web Push. `/vapid-public-key` exposes the public VAPID key so the browser can subscribe.

## Endpoints

- `GET /notifications` — paginated list with unread count
- `GET /notifications/unread-count`
- `POST /notifications/{id}/read` / `…/action`
- `GET/PUT /notifications/settings` — per-user category toggles
- `POST /notifications/subscribe` / `…/unsubscribe`
- `GET /notifications/vapid-public-key`

## Depends on

- [[Notification Service]]
- [[Notification Model]]

## See also

- [[_index]]
