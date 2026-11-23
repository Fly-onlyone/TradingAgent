---
tags: [desktop, admin, backup, email, notifications]
---

# Admin and Backup

> The log, the database, backups, deleting data, and email. Code:
> `src/TradingAgent.Data/Admin/AdminStore.cs`, `src/TradingAgent.App/ViewModels/AdminViewModel.cs`,
> `src/TradingAgent.Data/Notifications/SmtpEmailSender.cs`.

## Log

Warnings and errors are also written to the `logs` table (30 days). The Admin page lists them newest
first, by level and by text. The text typed is matched literally: `%` and `_` are not wildcards.
Every line passed `Redactor` before it was stored.

## Database

The page shows the file, its size, the schema version and the row count of every table, and can ask
SQLite to check the file (`PRAGMA integrity_check`) and to compact it (`VACUUM`).

## Backup and restore

- **Back up now** writes a consistent copy with `VACUUM INTO` to `backups\` in the
  [[Desktop Data Folder]], while the app keeps running.
- A backup holds everything, the keys too. They stay encrypted for the Windows account (DPAPI), so a
  backup can be restored on that account only.
- **Restore** cannot replace a database that is open. So the page only writes down which backup is
  wanted (`restore-pending.txt`), and the next start puts it in place before anything opens the
  file: `AdminStore.ApplyPendingRestore`, called first in `ShellApp.BuildServices`. The database
  that is replaced is kept as `trading-agent.db.before-restore`.
- Only an SQLite file inside the app's backup folder is ever restored or deleted. A marker that
  points anywhere else is ignored and removed.

## Deleting data

One kind at a time: chats and task runs, memories, strategies, lessons and patterns, news, tasks,
notifications, log entries. Orders are not offered: they are a mirror of what OKX holds and would
come back.

Restore and delete take two presses ([[App Pages]]).

## Email

`NotificationService` sends a copy of each notification by email when email is switched on and a
server, a sender and a receiver are set (Settings). `SmtpEmailSender` speaks SMTP with STARTTLS,
which is port 587 of the usual providers; a server that only takes TLS from the first byte (port
465) is not supported. The password is a secret like the others. A mail server that fails loses
nothing: the notification is stored and shown as before, and the failure is logged.

An email holds the notification's text, which can name an instrument and an amount.

## See also

- [[Desktop Data Folder]]
- [[SQLite Schema Conventions]]
