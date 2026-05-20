---
tags: [pattern]
---

# AUMID Configuration

> Windows toast title icon comes from an AUMID (App User Model ID) lookup on a Start Menu shortcut — not from the `icon=` parameter.

## When to apply

Whenever changing toast app identity or debugging missing title icons.

## The pattern

| Icon position | Source |
|---|---|
| Content icon (left of body) | `winotify` `icon=` parameter (absolute path) |
| Title icon (tiny, next to app name) | Windows AUMID lookup on Start Menu shortcut |

Current working AUMID: `TradingAgent` (set in `backend/app/services/desktop_notify.py`).

`ensure_notification_shortcut()` patches the AUMID on first run via `pywin32`. The NSIS installer sets AUMID from `tauri.conf.json` `identifier`.

## Why

If Windows caches a broken state for an AUMID, switching to a fresh ID is the only reliable fix without nuking the icon cache.

## Don't

- Don't clear Windows icon cache (`ie4uinit.exe -ClearIconCache` + explorer restart) — it breaks ALL app toast title icons until cache rebuilds
- Don't change AUMID without also updating `desktop_notify.py`

## See also

- [[_index]]
- [[Windows Toast Notifications]]
- [[AUMID]]
