---
tags: [operations]
---

# Production Debugging Checklist

> When something is broken in prod, follow this order before opening code.

## What it does

1. **Query `logs`** ([[MongoDB MCP Queries]]) — ERROR/WARNING in the last 24h grouped by `logger_name`
2. **Check `agent_sessions`** — recent failed sessions (0 assistant_messages), stuck sessions (`is_active=true` for >2h)
3. **Inspect `app_settings`** — config values that may have drifted (token expiry, scheduler flags, model selection)
4. **Sentry dashboards** — unresolved issues in `trading-agent-backend` and `trading-agent-frontend`
5. **Embeddings status** — search for "Embedding generation failed" / "Embeddings permanently disabled"
6. **News crawler** — failed RSS crawls

Only after this — read code.

## Why

Code reads are slow and biased. MongoDB shows what actually happened. Sentry shows the user-visible failure mode.

## Gotchas

- Skip `users` and `app_settings.content` in scripts — privacy rules
- See `docs/MONITORING.md` for the full schedule and report format

## See also

- [[_index]]
- [[MongoDB MCP Queries]]
- [[Monitoring Health Checks]]
- [[Sentry Backend]]
