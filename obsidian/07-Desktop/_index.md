---
tags: [desktop, moc]
---

# Desktop MOC

> The native rewrite: one C# process (Avalonia 12, Native AOT, SQLite) that replaces the Tauri
> webview, the Python sidecar and MongoDB. Code lives in `src/` and `tests/` at the repository root.

The old app (`backend/`, `frontend/`) stays buildable until the last feature slice is done. Today the
native app is a **skeleton**: build, data layer, shell behaviour, installer and crash reporting, with
one page (Diagnostics). It has no trading or agent features yet.

## Why and what

- [[Native Rewrite Decisions]]
- [[Desktop Solution Layout]]

## Build & Run

- [[Desktop Build Commands]]
- [[Desktop Build Gotchas]]

## Data

- [[Desktop Data Folder]]
- [[SQLite Schema Conventions]]

## Shell & Release

- [[Desktop Shell Behaviour]]
- [[Desktop Release Pipeline]]
- [[Desktop Crash Reporting]]

## See also

- [[_HOME]]
- [[05-Operations/_index|Operations]] — the old app's build, release and monitoring notes
