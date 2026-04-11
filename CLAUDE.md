# CLAUDE.md

This file provides guidance to Coding agent when working with this project.

## External References

- **Notion task board**: See [`docs/NOTION.md`](docs/NOTION.md) for database schema, status values, and property
  definitions

## Build Commands

| Task                      | Command                         |
|---------------------------|---------------------------------|
| Install backend deps      | `uv sync`                       |
| Install frontend deps     | `cd frontend && bun install`    |
| Run dev server (backend)  | `uv run python run.py`          |
| Run dev server (frontend) | `cd frontend && bun run dev`    |
| Test backend              | `uv run pytest`                 |
| Test frontend             | `cd frontend && bun run test`   |
| Lint backend              | `uv run ruff check`             |
| Lint frontend             | `cd frontend && bun run lint`   |
| Format backend            | `uv run ruff format`            |
| Format frontend           | `cd frontend && bun run format` |
| Check frontend            | `cd frontend && bun run check`  |

## Tauri (v2) Quick Notes

- Run desktop dev: `cd frontend && bun run tauri:dev` (or `npm run tauri:dev`)
- Build desktop app: `cd frontend && bun run tauri:build` (or `npm run tauri:build`)
- Required on Windows:
    - Rust (`cargo`) available in PATH (`%USERPROFILE%\.cargo\bin`)
    - Visual Studio 2022 Build Tools with C++ workload (`MSVC v143` + Windows SDK)
- Quick checks:
    - `cargo --version`
    - `cmd /c "where link && where cl"`
- Tauri v2 config note:
    - Do not use `plugins.shell.scope` in `tauri.conf.json`
    - Keep `plugins.shell` minimal (e.g. `open`)
    - Put shell command permissions in `src-tauri/capabilities/default.json`

## Sentry

Separate Sentry projects per layer (org: `fly-theonlyone`):

- **Backend project**: `trading-agent-backend` — `sentry-sdk[fastapi]`, conditional init when `SENTRY_DSN` is set
    - FastAPI auto-integration (transactions, error capture), `LoggingIntegration` (ERROR+ as events, INFO+ as
      breadcrumbs)
    - Config: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`,
      `SENTRY_PROFILES_SAMPLE_RATE`
    - Test endpoint: `POST /api/v1/admin/sentry-test` (superuser)
- **Frontend project**: `trading-agent-frontend` — `@sentry/react`, conditional init when `VITE_SENTRY_DSN` is set
    - `Sentry.ErrorBoundary` wraps the React tree in `main.tsx`
    - Browser tracing + profiling integrations
    - Source maps uploaded via `@sentry/vite-plugin` to `trading-agent-frontend` project when `SENTRY_AUTH_TOKEN` is set
      at build time
    - Config: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, `VITE_SENTRY_TRACES_SAMPLE_RATE`,
      `VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE`, `VITE_SENTRY_PROFILE_LIFECYCLE`
- **Admin page**: `/admin/sentry` — status, captured items, test events, dashboard links

## Project Overview

**Trading agent** is a full-stack application for automated cryptocurrency trading with AI-powered analysis.

### Backend (Python)

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Database**: MongoDB (Beanie ODM)
- **Package Manager**: uv

### Frontend (TypeScript)

- **Language**: TypeScript 5.7
- **Framework**: React 19 + Vite
- **Routing**: TanStack Router
- **State**: Zustand + TanStack Query
- **UI**: Material UI 6

## Architecture Notes

- **Backend port**: **7000**
- **Dev entry**: `python run.py` starts both frontend + backend with watchfiles reload
- **Auth**: JWT-based with configurable token expiry and transparent refresh. Superuser check via
  `get_current_superuser`
  dependency (defined in auth dependency files)
    - Token expiry: configurable via `AppSettings.access_token_expire_minutes` (DB) > `ACCESS_TOKEN_EXPIRE_MINUTES` (
      env) > 0 (no expiry)
    - `POST /auth/refresh` — re-issues token from valid current token
    - `POST /auth/change-password` — invalidates all prior tokens via `iat` vs `password_changed_at` check
    - Frontend interceptor auto-refreshes on 401 before logging out
    - Encryption: Fernet (AES-128-CBC + HMAC-SHA256) for secrets at rest, keys from `SECRETS_ENCRYPTION_KEYS` env var

## Key Patterns

- **Backend model**: Beanie `Document` with `class Settings` for collection name + indexes. See `log.py`
- **Backend API**: Router with Pydantic request/response schemas. Aggregation uses `get_pymongo_collection()` (not the
  deprecated `get_motor_collection`)
- **DB session**: All models must be registered in `backend/app/db/session.py` `document_models` list
- **API router registration**: In `backend/app/api/v1/__init__.py` — order matters (specific prefixes before generic
  `/admin`). Sub-prefixes (e.g. `/strategies/import`) must be registered before their parent (`/strategies`)
- **Strategy import**: Two-step flow — extract (URL or file upload → AI extraction → preview) then confirm (save both
  `Strategy` + `StrategyKnowledge` with embedding). Endpoints at `/api/v1/strategies/import/`. AI extraction uses
  Claude tool_use with forced `save_strategy` tool for structured output. Pattern:
  `backend/app/services/strategy_extractor.py`
- **Strategy auto-discovery**: Scheduled crawling of news sources (where `strategy_extraction=True`) → AI extraction →
  deduplicate by name → save to StrategyKnowledge (RAG only, not executable). Config in `AppSettings` singleton
  (`auto_discover_enabled/interval_hours/min_confidence`). APScheduler integration in `task_scheduler.py`.
  Service: `backend/app/services/strategy_discovery.py`. UI card on Tasks page.
- **Frontend types**: snake_case from API → camelCase in TS via transform functions in endpoint files
- **Frontend state**: Zustand stores with devtools middleware. Pattern: `store/xxxStore.ts`
- **Query options**: Centralized in `frontend/src/api/queryOptions/admin.ts` with shared `ADMIN_STALE_TIME`/
  `ADMIN_GC_TIME`
- **Route pages**: TanStack Router file-based routing. `@tanstack/router-plugin` in `frontend/vite.config.ts`
  auto-generates the route tree during dev/build, so manual `router-cli generate` is usually unnecessary.
- **Sidebar nav**: Items defined as arrays in `Sidebar.tsx` — `adminMenuItems` for admin section
- **RAG retrieval pipeline**: `_vectorized_search()` in `retriever.py` — Motor projection loads only `_id` +
  `embedding`,
  NumPy matrix dot product scores all docs at once, time-decay weighting applied per-collection, then top-k full docs
  fetched. Each search method runs hybrid (vector + text via `_text_search()`), merges via `fusion.py` RRF, then
  optionally re-ranks via `reranker.py` (FlashRank, controlled by `AppSettings.reranking_enabled`)
- **RAG scoring**: Search methods return `list[tuple[Document, float]]` — all consumers (knowledge_tools, news_tools,
  API endpoints) unpack `(doc, score)` tuples. Scores include `relevance_score` in agent tool responses
- **Contextual embeddings**: `context_generator.py` uses Claude Haiku to prepend 1-2 sentence context prefix before
  embedding (write-time). `context_prefix` field on all 4 knowledge models. Embedding generators prepend it
  automatically
- **Knowledge graph**: `KnowledgeEdge` model in `knowledge_graph.py`, `graph.py` builds edges during document creation.
  Registered in `session.py`
- **Document chunking**: `chunker.py` splits long text into 200-word chunks with 50-word overlap. `KnowledgeChunk` model
  stores chunks with parent references. Registered in `session.py`
- **RAG evaluation**: `evaluator.py` computes Precision@k, Recall@k, MRR, NDCG@k. Tests in `test_rag_evaluation.py`

## Linting Rules

- **Ruff**: Enforces `X | None` over `Optional[X]`, `datetime.UTC` over `timezone.utc`, sorted imports. Run
  `ruff check --fix` to auto-fix
- **Biome**: Enforces tabs (not spaces), double quotes, sorted imports. PyCharm reformatter uses spaces — always run
  `biome check --write` AFTER `reformat_file` to reconcile
- **Skeleton keys**: Biome enforces `noArrayIndexKey` even for loading placeholders. Use stable string keys for
  skeleton rows/cards instead of array indexes.
- **Hook ordering**: Biome enforces `useHookAtTopLevel` — early returns (like auth guards) must come AFTER all hooks,
  not before
- **Current CI state**: `uv run ruff check backend/`, `uv run ruff format --check backend/`,
  `uv run pytest --tb=short -q`,
  `cd frontend && bun run check`, `cd frontend && bun run test`, and `cd frontend && bun run build` are currently
  green. Remaining warnings are non-blocking (for example Pydantic v2 deprecation warnings in tests and Vite chunk-size
  warnings in frontend builds).

## Context7 IDs

FastAPI=/tiangolo/fastapi, Beanie=/BeanieODM/beanie, Anthropic=/anthropics/anthropic-sdk-python, React=/facebook/react,
TanStack-Router=/TanStack/router, TanStack-Query=/TanStack/query, MUI=/mui/material-ui, Zustand=/pmndrs/zustand,
Pydantic=/pydantic/pydantic, Motor=/mongodb/motor, python-okx=/okx/python-okx, OpenAI=/openai/openai-python,
Biome=/biomejs/biome, Vite=/vitejs/vite, Framer-Motion=/framer/motion
