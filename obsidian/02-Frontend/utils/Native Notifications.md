---
tags: [frontend, utils, tauri, notifications]
---

# Native Notifications

> Thin wrapper over the standard Web `Notification` API for in-frontend toast triggers.

## Source

- `frontend/src/utils/nativeNotifications.ts`

## How it works

```ts
refreshNativeNotificationSetting()   // cache enable flag from /settings/native-notification
sendNativeNotification(title, body)  // permission request → new Notification(...)
```

Uses the standard browser `Notification` API (works in Tauri's WebView2 / Chromium — no Rust plugin needed). Permission is requested lazily on first send. Notifications include the `/coin.png` icon.

## Gotchas

- **Windows toast icons are NOT set from here.** The desktop toast icon (left of title) and the AUMID-bound app icon both come from `winotify` running in the Python backend — see [[winotify Toast]] and the chat-session pattern in `code-guide.md`. Tauri's `tauri-plugin-notification` `icon` field is Android/Linux-only and does nothing on Windows; `notify_rust` has the same problem.
- This file's `new Notification(title, { icon: "/coin.png" })` only sets the content icon for WebView-rendered notifications, not Windows toasts.
- Disabled silently when `notificationsEnabled` is false or `Notification` is unsupported.

## See also

- [[Windows Toast Notifications]]
- [[winotify Toast]]
