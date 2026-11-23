---
tags: [desktop, data]
---

# Desktop Data Folder

> The app keeps its database and logs under `%LOCALAPPDATA%\TradingAgent\`. Debug builds use
> `%LOCALAPPDATA%\TradingAgent-Dev\`.

## What it does

- `trading-agent.db` — the one SQLite file (WAL mode), see [[SQLite Schema Conventions]].
- `logs\app.jsonl` — rolling JSON-lines log, 10 MB × 5 files.
- `trade-kit\` — the home folder the OKX trade kit is given, see [[Trade Kit Sidecar]]. Created when
  the kit is first started. It never holds the key.
- `claude-code\` — the folder Claude Code is started in, see [[Claude Code Runtime]]. Holds a
  `runs\` folder per run in progress, deleted when the run ends.
- Paths come from `AppPaths` in `src/TradingAgent.Core/AppPaths.cs`.

## Settings and secrets

- **Settings** are rows in the `settings` table: `key`, JSON `value`, `updated_at`. Keys are typed
  constants in `src/TradingAgent.Core/Settings/SettingKeys.cs`, each with a default, so a new
  setting needs no migration. Read and write through `ISettingsStore` (`GetValue`, `SetValue`,
  `Reset`, `Changed`). A stored value of the wrong shape falls back to the default.
- **Secrets** are rows in the `secrets` table, encrypted with Windows DPAPI for the current user
  (`DpapiSecretProtector`). Only the names in `SecretNames` are accepted. The UI never gets a
  value back, only a state (`Unset`, `Saved`, `Unreadable`) and a hint of the last four characters
  for values of 12 characters or more. A blob that cannot be decrypted counts as missing.

## Logging

- Every message passes `Redactor` (`src/TradingAgent.Core/Logging/Redactor.cs`) before any sink:
  keys and tokens are masked, and the user-profile path becomes `%USERPROFILE%`.
- Warnings and errors are also written to the `logs` table in batches (50 records or 5 seconds).
- `RetentionService` deletes log rows older than 30 days, at start and daily.

## Gotchas

- The installer uses a different folder (`%LOCALAPPDATA%\Fly.TradingAgent\`). Updating or
  uninstalling never deletes the data folder.
- DPAPI ties secrets to the Windows user. A database copied to another user or machine keeps its
  settings but its secrets read as `Unreadable`.

## See also

- [[_index]]
- [[SQLite Schema Conventions]]
- [[Desktop Crash Reporting]]
