# Production Monitoring Schedule

Auto-create these local monitoring cron jobs on every new Claude session.

## Daily Health Check

- **Cron**: `3 9 * * *` (9:03 AM local, daily)
- **Report**: `.claude/report/daily-YYYY-MM-DD.md`

### Checks

1. **Logs** (`trading_agent.logs`): ERROR/WARNING in last 24h, count by `logger_name`, top 5 error messages
2. **Agent sessions** (`trading_agent.agent_sessions`): sessions created, failed (0 `assistant_messages`), stuck (`is_active=true` older than 2h) — metadata only
3. **Embeddings** (`trading_agent.logs`): "Embedding generation failed" or "Embeddings permanently disabled"
4. **News crawler** (`trading_agent.logs`): crawler errors/warnings, failed RSS crawls
5. **Sentry**: new unresolved issues in `trading-agent-backend` and `trading-agent-frontend` (org: `fly-theonlyone`)

## Weekly Deep Analysis

- **Cron**: `7 9 * * 1` (Monday 9:07 AM local)
- **Report**: `.claude/report/weekly-YYYY-MM-DD.md`

### Checks

1. **Error trends**: daily error counts for 7 days, spikes (>2x average), new error types vs prior week
2. **Session health**: total sessions, success rate (sessions with >=1 assistant message), average messages per session, stuck sessions
3. **RAG system**: embedding errors, document counts across `knowledge_chunks`, `knowledge_edges`, `strategy_knowledge`, `trade_lessons`, `trading_patterns`
4. **News crawler**: success/failure rate, new `news_articles` count by `created_at`
5. **Sentry**: 7-day unresolved issues, performance regressions
6. **Infrastructure**: DNS resolution failures, MongoDB connection issues, WebSocket errors in logs

## Privacy Rules

- **NEVER** query: `users`, `app_settings` (contain API keys, passwords, secrets)
- **NEVER** read `content` fields in `agent_sessions.messages` — metadata only (counts, timestamps, status, title)
- **Safe collections**: `logs`, `agent_sessions` (metadata only), `knowledge_chunks`, `knowledge_edges`, `news_articles`, `strategy_knowledge`, `trade_lessons`, `trading_patterns`, `news_sources`, `orders`, `trades`

## Report Format

Each report starts with:

```
# [Daily/Weekly] Health Report — YYYY-MM-DD

## Summary
- **Status**: HEALTHY / DEGRADED / UNHEALTHY
- **Errors**: X (period)
- **Warnings**: X (period)
- **Failed sessions**: X
- **Key issues**: ...
```

Commit and push the report after writing.
