---
tags: [desktop, moc]
---

# Desktop MOC

> The app: one C# process (Avalonia 12, Native AOT, SQLite). Code lives in `src/` and `tests/` at
> the repository root.

It replaced the Tauri webview, the Python sidecar and MongoDB, which were removed from the repository
in November 2026. The other zones of this vault describe that previous app and are history.

## Why and what

- [[Native Rewrite Decisions]]
- [[Desktop Solution Layout]]

## Build & Run

- [[Desktop Build Commands]]
- [[Desktop Build Gotchas]]

## Data

- [[Desktop Data Folder]]
- [[SQLite Schema Conventions]]

## Pages

- [[App Pages]]

## Agent

- [[Agent Runs]]
- [[Exchange and Risk]]
- [[Trade Kit Sidecar]]
- [[Risk Gate]]
- [[Order Mirror]]
- [[Claude Code Runtime]]
- [[Scheduled Tasks]]
- [[Knowledge and Search]]
- [[Trades and Learning]]

## Shell & Release

- [[Desktop Shell Behaviour]]
- [[Desktop Release Pipeline]]
- [[Desktop Crash Reporting]]
- [[Admin and Backup]]

## See also

- [[_HOME]]
- [[05-Operations/_index|Operations]]: the previous app's build, release and monitoring notes (history)
