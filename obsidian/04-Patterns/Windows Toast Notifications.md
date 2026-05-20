---
tags: [pattern]
---

# Windows Toast Notifications

> Use [[winotify Toast]] from the Python backend for desktop notifications — NOT Tauri's plugin or `notify_rust`.

## When to apply

Any feature that wants to surface a Windows toast (chat session completed, trade executed, alert, etc.).

## The pattern

```python
# backend/app/services/desktop_notify.py
from winotify import Notification

toast = Notification(
    app_id="TradingAgent",      # must match AUMID
    title="Title",
    msg="Body",
    icon=str(icon_path),         # absolute path to .ico/.png
)
toast.show()
```

Called from [[Notification Service]] via `asyncio.to_thread()`.

## Why

Tauri's notification plugin and `notify_rust`'s `icon` field are Android/Linux only — they do nothing on Windows. `winotify` correctly produces a content icon and uses [[AUMID]] for the title icon.

## Don't

- Don't use Tauri's notification plugin for Windows toasts with icons
- Don't clear the Windows icon cache to fix issues — see [[AUMID Configuration]]

## See also

- [[_index]]
- [[AUMID Configuration]]
- [[winotify Toast]]
- [[Desktop Toast Pipeline]]
