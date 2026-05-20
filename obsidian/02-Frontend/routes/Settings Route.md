---
tags: [frontend, routes]
---

# Settings Route

> `/settings` — exchange credentials, notification channels, agent config, theme, autostart.

## Source

- `frontend/src/routes/settings.tsx`

## How it works

`requireAuth()` guard. Composed of tab sections backed by [[Settings Components]]:
notification providers (Apprise + native), exchange API keys (encrypted via
Fernet on the backend), agent model/effort defaults, theme picker, zoom level,
and Tauri autostart toggle (see [[Capabilities]]). All form mutations use
React Query with optimistic updates and a `SaveIndicator` pulse on success.

## Depends on

- [[Settings Components]]
- [[useAppTheme]]
- [[React Query Options]]

## See also

- [[_index]]
- [[Notification Service]]
