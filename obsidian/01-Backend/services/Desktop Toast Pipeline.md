---
tags: [backend, services, notifications, windows]
---

# Desktop Toast Pipeline

> Windows-only toast delivery via `winotify` with app-icon resolution and AUMID shortcut patching.

## Source

- `backend/app/services/desktop_notify.py`

## How it works

`send_desktop_notification(title, body)` builds a `winotify.Notification` with `app_id="TradingAgent"` (the known-working AUMID — see [[AUMID Configuration]]) and the resolved app icon, then calls `toast.show()`. Module is a no-op when `winotify` isn't importable or `platform.system() != "Windows"`.

`ensure_notification_shortcut()` runs once per process: it walks `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Trading agent.lnk`, reads `System.AppUserModel.ID` via `win32com.propsys`, and patches it to `APP_ID` if it doesn't match. Without this, Windows shows a generic title icon next to the app name in the Action Center.

Icon path is resolved lazily via `_get_icon_path()` — searches the frozen exe's `icons/` dir first, then `frontend/src-tauri/icons/` for development. Wrapped by [[Notification Service]]`._send_desktop_toast()` via `asyncio.to_thread()`.

## Depends on

- `winotify`
- `pywin32` (`win32com.propsys`)

## Used by

- [[Notification Service]]

## Gotchas

- NEVER clear the Windows icon cache to fix a broken AUMID — it breaks every app's toast title icons until rebuild.
- See `.claude/rules/code-guide.md` "Windows Desktop Toast Notifications" — Tauri / `notify_rust` icon args are Linux-only and do nothing here.

## See also

- [[_index]]
- [[winotify Toast]]
- [[AUMID Configuration]]
