# Architecture

System flows, data-flow diagrams (Mermaid), and the knowledge-graph schema live in the
Obsidian vault under `obsidian/00-Architecture/`.

- [Trading Decision Flow](../../obsidian/00-Architecture/Trading%20Decision%20Flow.md)
- [RAG Retrieval Pipeline](../../obsidian/00-Architecture/RAG%20Retrieval%20Pipeline.md)
- [Knowledge Graph Edges](../../obsidian/00-Architecture/Knowledge%20Graph%20Edges.md)
- [JWT Auth Flow](../../obsidian/00-Architecture/JWT%20Auth%20Flow.md)
- [WebSocket Connection Manager](../../obsidian/00-Architecture/WebSocket%20Connection%20Manager.md)
- [Background Service Startup](../../obsidian/00-Architecture/Background%20Service%20Startup.md)
- [Request Logging Pipeline](../../obsidian/00-Architecture/Request%20Logging%20Pipeline.md)
- [Strategy Auto-Discovery Cycle](../../obsidian/00-Architecture/Strategy%20Auto-Discovery%20Cycle.md)
- [Subagent Delegation Pattern](../../obsidian/00-Architecture/Subagent%20Delegation%20Pattern.md)
- [Chat-Session Lifecycle](../../obsidian/00-Architecture/Chat-Session%20Lifecycle.md)

Full zone MOC: [`obsidian/00-Architecture/_index.md`](../../obsidian/00-Architecture/_index.md)

## Native desktop app (`src/`, `tests/`)

The native rewrite (C# + Avalonia, Native AOT, SQLite) has its own zone, `obsidian/07-Desktop/`.

- [Native Rewrite Decisions](../../obsidian/07-Desktop/Native%20Rewrite%20Decisions.md) — settled; do not reopen without the owner
- [Desktop Solution Layout](../../obsidian/07-Desktop/Desktop%20Solution%20Layout.md)
- [SQLite Schema Conventions](../../obsidian/07-Desktop/SQLite%20Schema%20Conventions.md)
- [Desktop Shell Behaviour](../../obsidian/07-Desktop/Desktop%20Shell%20Behaviour.md)

Full zone MOC: [`obsidian/07-Desktop/_index.md`](../../obsidian/07-Desktop/_index.md)
