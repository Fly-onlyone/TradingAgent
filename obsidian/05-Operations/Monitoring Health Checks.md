---
tags: [operations]
---

# Monitoring Health Checks

> Scheduled local monitoring jobs documented in `docs/MONITORING.md`.

## What it does

### Daily health check

- **Cron**: `3 9 * * *` (9:03 AM local)
- **Report**: `.claude/report/daily-YYYY-MM-DD.md`
- Checks: logs (24h ERROR/WARNING by logger_name), agent sessions (created / failed / stuck), embeddings errors, news crawler errors, Sentry new unresolved issues

### Weekly deep analysis

- **Cron**: `7 9 * * 1` (Monday 9:07 AM local)
- **Report**: `.claude/report/weekly-YYYY-MM-DD.md`
- Checks: 7-day error trends, session health (success rate, avg messages), RAG document counts, news crawler success rate, Sentry 7-day issues, infrastructure (DNS, MongoDB, WebSocket)

## Gotchas

- **NEVER** query `users` or `app_settings` content (secrets, API keys)
- **NEVER** read `agent_sessions.messages.content` — metadata only
- Commit and push the report after writing

## See also

- [[_index]]
- [[Production Debugging Checklist]]
- [[MongoDB MCP Queries]]
