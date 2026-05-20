---
tags: [frontend, tauri]
---

# Tauri v2 Config

> `tauri.conf.json` declares window geometry, CSP (with Sentry ingest URLs), bundle resources, and minimal `plugins.shell`.

## Source

- `frontend/src-tauri/tauri.conf.json`

## How it works

`identifier: com.fly.tradingagent` doubles as the Windows AUMID. Main window
defaults: 1400x900, min 1024x700, hidden until Rust restores state and shows it.
CSP allows `connect-src` to localhost + 127.0.0.1 (HTTP/WS) plus
`https://*.ingest.sentry.io` and `https://*.ingest.us.sentry.io`; `img-src`
allows `https://assets.coincap.io`. Plugin section is intentionally minimal
(`shell: { open: true }`) — Tauri v2 does NOT use `plugins.shell.scope`;
permissions live in [[Capabilities]]. Bundle resources include
`trading-agent-backend.exe` (the [[Sidecar Binary]]) and `.env`.

## Depends on

- [[Capabilities]]
- [[Sentry Browser Config]]

## Gotchas

- Editing `version` here by hand will be reverted by Release Please.
- Removing the Sentry ingest CSP entries breaks error reporting in packaged builds.

## See also

- [[_index]]
- [[Sidecar Binary]]
