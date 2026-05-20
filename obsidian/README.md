# Trading Agent — Obsidian Vault

This folder is an **Obsidian vault** that documents the Trading Agent codebase as a
graph-linked knowledge base. It is checked into the repo so documentation travels with
the code.

## Open the vault

**Option A — GUI (recommended for browsing):**

1. Launch Obsidian.
2. Choose **"Open folder as vault"**.
3. Select this `obsidian/` folder.
4. Start at [[_HOME]].

**Option B — Any markdown editor:**

Notes are plain Markdown with `[[wikilinks]]`. They render fine in VS Code,
PyCharm, Vim, or `cat`. Wikilinks won't be clickable outside Obsidian, but the
filename inside `[[...]]` is the target.

**Option C — Obsidian CLI** (Obsidian 1.12+, must be running):

```powershell
& "C:\Users\PC\AppData\Local\Programs\Obsidian\Obsidian.com" read file="_HOME"
```

## Structure

- [[_HOME]] — root Map of Content (start here)
- `00-Architecture/` — cross-cutting flows (trading, RAG, auth, WebSocket)
- `01-Backend/` — FastAPI server concepts (agent, api, db, knowledge, exchange, news, services, security, middleware, core)
- `02-Frontend/` — React + Tauri concepts (components, routes, store, hooks, animations, theme, utils, tauri)
- `03-Integrations/` — external systems (MongoDB, OKX, Anthropic, Sentry, Tauri, etc.)
- `04-Patterns/` — codebase conventions (CSS zoom, Framer Motion, AI auth, etc.)
- `05-Operations/` — build, dev server, releases, debugging
- `06-Glossary/` — domain terms
- `_Templates/` — note templates for new concepts

Each leaf folder has an `_index.md` MOC that lists every concept inside it.

## Granularity

One note **per concept** — a class, a flow, a pattern, an integration. Not one note
per file. Notes are short (50–200 words) and link heavily to each other. Source code
is referenced by relative path (e.g., `backend/app/agent/trading_agent.py`) and
*never* duplicated in the vault — code rots, notes shouldn't.

## Diagrams

Diagrams use **Mermaid** (native Obsidian support, no plugin). No PNG / Excalidraw,
to keep the vault grep-able and diff-able.

## Contributing

Add new concept notes by copying `_Templates/Concept Note.md`. After writing a note,
update the parent folder's `_index.md` MOC with a one-line entry and a wikilink.
