# CLAUDE.md

This file provides guidance to Coding agent when working with this project.

## Documentation Index — read the vault first

Primary documentation source: **[`obsidian/_HOME.md`](obsidian/_HOME.md)** — a 356-note
Obsidian vault covering architecture, modules, patterns, integrations, and operations.
Open as an Obsidian vault, or browse the markdown directly.

Pick the zone by what you're about to do:

| Task                                  | Zone to read first                                                                                                       |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Bug fix in a Python module            | [`obsidian/01-Backend/<module>/_index.md`](obsidian/01-Backend/_index.md)                                                |
| Bug fix in a React module             | [`obsidian/02-Frontend/<module>/_index.md`](obsidian/02-Frontend/_index.md)                                              |
| New feature touching the agent or RAG | [`obsidian/00-Architecture/`](obsidian/00-Architecture/_index.md) + [`obsidian/04-Patterns/`](obsidian/04-Patterns/_index.md) |
| Anything chat-session related         | **[`obsidian/04-Patterns/Chat-Session Checklist.md`](obsidian/04-Patterns/Chat-Session%20Checklist.md)** (10-leg list)    |
| Adding an external dependency         | [`obsidian/03-Integrations/`](obsidian/03-Integrations/_index.md)                                                        |
| Build / dev server / release / debug  | [`obsidian/05-Operations/`](obsidian/05-Operations/_index.md)                                                            |
| Unfamiliar acronym or term            | [`obsidian/06-Glossary/`](obsidian/06-Glossary/_index.md)                                                                |

## External References

- **Notion task board**: See [`docs/NOTION.md`](docs/NOTION.md) for database schema, status values, and properties.
- **Rule files**: `.claude/rules/architecture.md`, `.claude/rules/code-guide.md`, `.claude/rules/documentation-style.md` — thin pointers into the vault for architecture/patterns/style.

## Project Overview

**Trading Agent** — full-stack AI-powered cryptocurrency trading platform.

- Backend: FastAPI + Beanie (MongoDB), Python 3.11+, managed by `uv`
- Frontend: React 19 + Vite + TanStack (Router/Query) + Zustand + MUI 6, managed by `bun`
- Desktop shell: Tauri v2 wraps the frontend; Python backend runs as a sidecar binary

Full stack and module map: [`obsidian/_HOME.md`](obsidian/_HOME.md).

## Quickstart commands

| Task              | Command                                                                |
|-------------------|------------------------------------------------------------------------|
| Install backend   | `uv sync`                                                              |
| Install frontend  | `cd frontend && bun install`                                           |
| Dev server (both) | `uv run python run.py`                                                 |
| Run tests         | `uv run pytest` / `cd frontend && bun run test`                        |
| Lint / format     | `uv run ruff check` / `cd frontend && bun run lint && bun run format`  |

Full command table: [`obsidian/05-Operations/Build Commands.md`](obsidian/05-Operations/Build%20Commands.md).

## Critical Operational Rules

These are gotchas that silently break builds, ports, or features if forgotten. Everything
else is in the vault.

- **Backend port**: **7001** in dev (`uv run python run.py`); **7000** when launched as the Tauri sidecar (`--serve`). See [`obsidian/05-Operations/Backend Port 7000 vs 7001.md`](obsidian/05-Operations/Backend%20Port%207000%20vs%207001.md).
- **Windows event loop**: `run.py` and `backend/app/main.py` set `WindowsProactorEventLoopPolicy()` at module level — `SelectorEventLoop` can't spawn subprocesses, which the Claude Agent SDK needs. Set it before any `asyncio.run()` in new entry points.
- **Dev reload**: uses `watchfiles.watch()` + `subprocess.Popen`, **NOT** `uvicorn --reload` (its `multiprocessing.spawn` children create `SelectorEventLoop` before app code runs). See [`obsidian/05-Operations/Dev Server Architecture.md`](obsidian/05-Operations/Dev%20Server%20Architecture.md).
- **JWT auth**: frontend interceptor auto-refreshes on 401 before logging out. `change-password` invalidates all prior tokens via `iat` vs `password_changed_at`. Encryption keys come from `SECRETS_ENCRYPTION_KEYS` env var (Fernet). See [`obsidian/00-Architecture/JWT Auth Flow.md`](obsidian/00-Architecture/JWT%20Auth%20Flow.md).
- **Production debugging**: query MongoDB `logs` collection first (use MongoDB MCP `find` / `aggregate`) before reading code. See [`obsidian/05-Operations/Production Debugging Checklist.md`](obsidian/05-Operations/Production%20Debugging%20Checklist.md).
- **DB models**: all Beanie `Document` classes must be registered in `backend/app/db/session.py` `document_models` list, or Beanie won't see them.
- **API router order**: in `backend/app/api/v1/__init__.py`, specific prefixes before generic `/admin`; sub-prefixes (e.g. `/strategies/import`) before parents (`/strategies`).
- **Strategy import**: `/api/v1/strategies/import/` is a **two-step** extract-then-confirm flow. Saves both `Strategy` + `StrategyKnowledge` with embedding.
- **Strategy shadow doc**: when a scheduler creates `StrategyKnowledge`, also create a `Strategy` doc owned by a real user. `user_id=None` silently skips the shadow and the Strategies page won't render it.
- **Aggregations**: use `get_pymongo_collection()`, **not** the deprecated `get_motor_collection`.
- **LLM provider**: `AppSettings.agent_provider` (enum: `ANTHROPIC` | `OPENAI`) selects the runtime. Anthropic supports dual auth (subscription via [`claude-agent-sdk`](obsidian/03-Integrations/claude-agent-sdk.md) OR API key); OpenAI is API-key only. `openai_api_key` is encrypted in `SECRET_FIELD_NAMES`. The main agent dispatch lives in `backend/app/agent/trading_agent.py`; all side services must use the `create()` factory from [`obsidian/04-Patterns/AI Service Auth.md`](obsidian/04-Patterns/AI%20Service%20Auth.md). Never hardcode model IDs in services.
- **ATK is the trade execution source of truth**: OKX Agent Trade Kit (Node MCP server `@okx_ai/okx-trade-mcp`) is mounted by both runtimes — Anthropic via `ClaudeAgentOptions.mcp_servers`, OpenAI via `backend/app/agent/okx_atk/openai_bridge.py`. **Never add a write method to `OKXClient`** — it is now READ-only (powers `services.order_mirror` + chart endpoints). The risk gate (`backend/app/agent/okx_atk/risk_hook.py`) is FAIL-CLOSED: it reads `RiskManager.assess_trade_risk().recommendation == "AVOID"` and denies; place tools with no recognized size alias (`SIZE_ALIASES` in `tool_curation.py`) are denied. Add new ATK write tools to one of `ATK_PLACE_TOOLS` / `ATK_CANCEL_TOOLS` / `ATK_TRANSFER_TOOLS` / `ATK_LEVERAGE_TOOLS` or they fail-closed. Sandbox toggle quiesces in-flight writes via `process_manager.is_accepting()` and rewrites `~/.okx/config.toml`. Agent system prompt requires `clOrdId = "s<24hex-session>-<4hex-nonce>"` so the mirror can O(1) update the originating chat-session tool-call bubble. Tauri production bundles ATK as a per-arch sidecar under `frontend/src-tauri/binaries/`; dev uses `npm install -g @okx_ai/okx-trade-mcp@1.3`.

## Tauri (v2) Gotchas

- Windows build deps: Rust (`%USERPROFILE%\.cargo\bin` on PATH) + Visual Studio 2022 Build Tools with C++ workload (`MSVC v143` + Windows SDK).
- **Do not** use `plugins.shell.scope` in `tauri.conf.json` (v2 ignores it). Keep `plugins.shell` minimal (`open` only). Shell command permissions live in `src-tauri/capabilities/default.json`.

Full Tauri + sidecar reference: [`obsidian/03-Integrations/Tauri v2.md`](obsidian/03-Integrations/Tauri%20v2.md), [`obsidian/02-Frontend/tauri/_index.md`](obsidian/02-Frontend/tauri/_index.md).

## Releases

**Release Please owns** versions (`pyproject.toml`, `frontend/package.json`,
`frontend/src-tauri/Cargo.toml`, `frontend/src-tauri/tauri.conf.json`) and `CHANGELOG.md`.
Don't hand-edit any of them. Source of truth: `.release-please-manifest.json`.

**Conventional commits required** — enforced by `commitlint.yml` + `conventional-pre-commit`.
Only `feat` / `fix` / `perf` / `revert` / `deps` / `refactor` appear in the changelog.

Full workflow: [`obsidian/05-Operations/Release Please Workflow.md`](obsidian/05-Operations/Release%20Please%20Workflow.md), [`obsidian/05-Operations/Conventional Commits.md`](obsidian/05-Operations/Conventional%20Commits.md).

## Sentry

Two projects under org `fly-theonlyone` — backend (`trading-agent-backend`) and frontend (`trading-agent-frontend`). Env vars in `.env.example`. Backend test endpoint: `POST /api/v1/admin/sentry-test` (superuser).

Setup details: [`obsidian/03-Integrations/Sentry Backend.md`](obsidian/03-Integrations/Sentry%20Backend.md), [`obsidian/03-Integrations/Sentry Frontend.md`](obsidian/03-Integrations/Sentry%20Frontend.md), [`obsidian/05-Operations/Sentry Setup.md`](obsidian/05-Operations/Sentry%20Setup.md).

## Linting Gotchas

- **Skeleton keys**: Biome enforces `noArrayIndexKey` **even for loading placeholders** — use stable string keys for skeleton rows/cards, not array indexes.
- **Hook ordering**: Biome enforces `useHookAtTopLevel` — early returns (auth guards) must come **after** all hooks, not before.
- **PyCharm reformat → Biome**: PyCharm uses spaces; Biome enforces tabs. Always run `biome check --write` **after** any PyCharm `reformat_file`.

Full rule reference: [`obsidian/05-Operations/Ruff Rules.md`](obsidian/05-Operations/Ruff%20Rules.md), [`obsidian/05-Operations/Biome Rules.md`](obsidian/05-Operations/Biome%20Rules.md).

## Context7 IDs

FastAPI=/tiangolo/fastapi, Beanie=/BeanieODM/beanie, Anthropic=/anthropics/anthropic-sdk-python, React=/facebook/react,
TanStack-Router=/TanStack/router, TanStack-Query=/TanStack/query, MUI=/mui/material-ui, Zustand=/pmndrs/zustand,
Pydantic=/pydantic/pydantic, Motor=/mongodb/motor, python-okx=/okx/python-okx, OpenAI=/openai/openai-python,
Biome=/biomejs/biome, Vite=/vitejs/vite, Framer-Motion=/framer/motion
