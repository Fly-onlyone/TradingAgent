---
tags: [integrations]
---

# winotify Toast

> Windows toast notification library called from Python — same approach as the ZZZ Bot reference project.

## Used for

- [[Desktop Toast Pipeline]] — fired from [[Notification Service]] when chat sessions complete or fail
- Implemented in `backend/app/services/desktop_notify.py`
- Runs in `asyncio.to_thread()` to avoid blocking the event loop

## Configuration

- `winotify>=1.1.0; sys_platform == 'win32'`
- App ID must match the Start Menu shortcut [[AUMID]] — currently `TradingAgent`
- Icon files resolved from `frontend/src-tauri/icons/` (dev) or `icons/` next to exe (prod)

## Gotchas

- Do NOT use Tauri's notification plugin or `notify_rust` — their `icon` is Android/Linux only and does nothing on Windows
- Title icon comes from AUMID lookup, not the `icon=` parameter — see [[AUMID Configuration]]

## See also

- [[_index]]
- [[Windows Toast Notifications]]
- [[AUMID Configuration]]
- [[Desktop Toast Pipeline]]
