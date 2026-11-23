---
tags: [desktop, data]
---

# SQLite Schema Conventions

> One SQLite file replaces 25 MongoDB collections. The schema is created by the numbered scripts in
> `src/TradingAgent.Data/Migrations/`: `0001_initial.sql` (everything) and `0002_agent_core.sql`
> (run state of replies and tool calls, the provider transcript).

## Conventions

| Thing | Rule |
|---|---|
| Ids | `TEXT`, 24 lowercase hex characters (4-byte time + 8 random bytes), from `Ids` in Core |
| Times | `INTEGER`, Unix milliseconds, UTC |
| Booleans | `INTEGER` 0 or 1 |
| Enums | `TEXT` with a `CHECK` listing every value |
| JSON | `TEXT` with `CHECK (json_valid(...))`, for free-form objects and small lists |
| Tables | `STRICT`; foreign keys declared (`ON DELETE CASCADE` for owned rows, `SET NULL` for references) |
| Owner | None. There is one local user: no table has a `user_id` |

The id width is part of a contract: OKX client order ids are `s<24hex-session>-<4hex-nonce>`.

## Tables

- **Infrastructure**: `settings`, `secrets`, `meta`, `logs`, `vectors`.
- **Agent**: `agent_sessions`, `agent_session_messages`, `agent_tool_calls`, `agent_transcript`,
  `agent_tasks`, `agent_decisions`, `agent_memories`, `notifications`.
- **Trading**: `orders`, `strategies`, `strategy_knowledge`, `strategy_discovery_cycles`,
  `trade_lessons`, `trading_patterns`.
- **News**: `news_sources`, `news_articles`, `news_article_assets`, `credibility_events`.

`agent_tool_calls` is a child table of a message, so the order mirror can update one tool-call
bubble by `tool_use_id` instead of rewriting a JSON array.

**Two kinds of history.** `agent_session_messages` and `agent_tool_calls` are what a chat screen
shows: one assistant message per run, with a `status` (`running`, `complete`, `cancelled`,
`failed`), and its tool calls with their own (`running`, `succeeded`, `failed`, `denied`).
`agent_transcript` is what is sent back to the model: the provider's own JSON items, append-only and
never rebuilt from the display tables, because providers require earlier items to come back
unchanged. Work that was `running` when the app stopped is marked `failed` at the next start
(`AgentStartupReconciler`).

## Search

- **Keyword search**: five external-content FTS5 tables (`strategy_knowledge_fts`,
  `trade_lessons_fts`, `trading_patterns_fts`, `news_articles_fts`, `agent_memories_fts`) kept in
  step by insert, update and delete triggers. Their source tables have an `INTEGER PRIMARY KEY seq`
  next to `id`, because FTS5 needs a stable integer row id.
- **Vector search**: `vectors` holds one embedding per item as a BLOB (little-endian float32,
  L2-normalized), keyed by `(kind, item_id)`, with the embedder name and a hash so a model change is
  detected. Search is a brute-force scan.

## Migrations

- Scripts are embedded resources named `NNNN_name.sql`. `MigrationRunner` applies them in order,
  each in its own transaction together with its version, stored in `PRAGMA user_version`.
- A failing script leaves the version unchanged.
- `Database` opens connections with WAL, foreign keys on, `synchronous = NORMAL`, and refuses to
  start if SQLite was built without FTS5.

## Gotchas

- **Never edit a migration that has shipped.** Add the next numbered script.
- SQLite has no TTL indexes. Expiry is done by `RetentionService`.
- Repositories exist only for what the skeleton uses (`settings`, `secrets`, `logs`). Each feature
  slice adds the repositories for its tables. Data access is hand-written ADO.NET
  (`Microsoft.Data.Sqlite`): no EF Core, no Dapper, because of Native AOT.

## See also

- [[_index]]
- [[Desktop Data Folder]]
- [[Native Rewrite Decisions]]
