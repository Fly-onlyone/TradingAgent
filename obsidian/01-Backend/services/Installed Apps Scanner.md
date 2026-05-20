---
tags: [backend, services, windows]
---

# Installed Apps Scanner

> Windows-only scan that lists installed apps from the registry + Steam library, with extracted exe icons.

## Source

- `backend/app/services/installed_apps_scanner.py`

## How it works

`scan_installed_apps()` is the async public entry — caches results for 60s and offloads the blocking `_scan_all()` to a thread. Internally it:

- `_scan_registry()` — walks HKLM, HKLM/WOW6432, and HKCU `Uninstall` keys via `winreg`, filters out system components (`SystemComponent=1`, `ParentKeyName`, redistributables/SDKs/drivers by name regex), and picks the best exe candidate from `DisplayIcon` or by directory probing (up to 2 levels deep).
- `_scan_steam()` — reads `Software\Valve\Steam` for the install path, parses `libraryfolders.vdf` and each `appmanifest_*.acf` to enumerate games. Skips entries already found via the registry.
- `_extract_icon_base64()` — ctypes-driven call to `shell32.ExtractIconExW` + GDI to produce a 32x32 RGBA PNG base64 string for the UI thumbnail.

Returns `InstalledApp` dataclasses (sorted: exe-bearing first, then alphabetic).

## Depends on

- `winreg`, `win32com.shell`, `ctypes`, `PIL`

## Used by

- [[Settings Endpoints]] (`GET /settings/installed-apps`)

## Gotchas

- Non-Windows hosts return `[]` everywhere — no exception paths break Linux/macOS dev.

## See also

- [[_index]]
