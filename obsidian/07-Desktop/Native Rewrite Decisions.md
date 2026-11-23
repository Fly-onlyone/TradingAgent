---
tags: [desktop, decision]
---

# Native Rewrite Decisions

> Decisions the owner made on 2026-11-22 and 2026-11-23 for the native rewrite. They are settled:
> do not reopen them without the owner.

## Stack

- **C# / .NET 10 + Avalonia 12, Native AOT.** Chosen after a measured three-way spike (branch
  `spike/native-ui`, `spikes/README.md`):

  | Toolkit | Warm start | Idle memory | Memory after 5 min |
  |---|---|---|---|
  | Avalonia 12 | 287 ms | 105.7 MB | 176.6 MB |
  | WinUI 3 | 327 ms | 141.5 MB | 231.2 MB |
  | Rust + GPUI | 334 ms | 108.0 MB | 111.4 MB |

  WinUI 3 failed the idle-memory gate (120 MB). The owner chose Avalonia over GPUI.
- **Windows first** on a cross-platform toolkit. Windows-only code sits in
  `TradingAgent.Platform.Windows` behind interfaces from `TradingAgent.Core`.
- **Full rewrite in one language.** No Python, no webview. IDE: Rider.

## Data

- **One SQLite file** (WAL), FTS5 for keyword search, embeddings as BLOBs scanned brute-force.
- **Fresh data.** No importer from MongoDB.
- **Single local user.** No login, no JWT, no REST API, no `user_id` columns. Secrets are protected
  with Windows DPAPI.
- **Full schema now**, minus dead tables and fields (`grid_bots`, `trades`, `market_data` and eight
  fields nothing writes).

## Agent (later phase)

- Own tool-use loop for Anthropic and OpenAI API keys, plus the Claude Code CLI as a subprocess for
  subscription sign-in.
- The OKX Agent Trade Kit Node sidecar stays, behind an in-app MCP proxy that holds the fail-closed
  risk gate.
- Embeddings through a provider (Ollama, LM Studio, cloud). Default is none: keyword search and a queue.

## Scope

- Slice 1: dashboard, agent chat, trading, orders, trades, settings.
- Slice 2: strategies, tasks, knowledge, memory, news.
- Slice 3: logs viewer, backup.
- Dropped: raw database viewer, bulk clear, knowledge graph, chunker, PWA, web push, the five auth screens.
- Notifications: Windows toasts and email (SMTP).

## Delivery

- Same repository. `TradingAgent.slnx` at the root, projects in `src/`, tests in `tests/`.
- Installers are unsigned for now. The release job is off until slice 1
  (see [[Desktop Release Pipeline]]).
- Crash reporting: one Sentry project, reporting on by default with a switch
  (see [[Desktop Crash Reporting]]).

## See also

- [[_index]]
- [[Desktop Solution Layout]]
