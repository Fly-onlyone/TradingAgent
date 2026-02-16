# CLAUDE.md

This file provides guidance to Coding agent when working with this project.

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

## Project Overview

**Trading Agent** is a full-stack application for automated cryptocurrency trading with AI-powered analysis.

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
- **Auth**: JWT-based. Superuser check via `get_current_superuser` dependency (defined in `logs.py`, reused by
  `bugs.py`)

## Key Patterns

- **Backend model**: Beanie `Document` with `class Settings` for collection name + indexes. See `log.py`, `bug.py`
- **Backend API**: Router with Pydantic request/response schemas. Aggregation uses `get_pymongo_collection()` (not the
  deprecated `get_motor_collection`)
- **DB session**: All models must be registered in `backend/app/db/session.py` `document_models` list
- **API router registration**: In `backend/app/api/v1/__init__.py` — order matters (specific prefixes before generic
  `/admin`)
- **Frontend types**: snake_case from API → camelCase in TS via transform functions in endpoint files
- **Frontend state**: Zustand stores with devtools middleware. Pattern: `store/xxxStore.ts`
- **Query options**: Centralized in `frontend/src/api/queryOptions/admin.ts` with shared `ADMIN_STALE_TIME`/
  `ADMIN_GC_TIME`
- **Route pages**: TanStack Router file-based routing. `@tanstack/router-plugin` in `frontend/vite.config.ts`
  auto-generates the route tree during dev/build, so manual `router-cli generate` is usually unnecessary.
- **Sidebar nav**: Items defined as arrays in `Sidebar.tsx` — `adminMenuItems` for admin section

## Linting Rules

- **Ruff**: Enforces `X | None` over `Optional[X]`, `datetime.UTC` over `timezone.utc`, sorted imports. Run
  `ruff check --fix` to auto-fix
- **Biome**: Enforces tabs (not spaces), double quotes, sorted imports. PyCharm reformatter uses spaces — always run
  `biome check --write` AFTER `reformat_file` to reconcile
- **Skeleton keys**: `noArrayIndexKey` warnings on skeleton loaders are pre-existing false positives (static
  placeholders) — same pattern in `logs.tsx`, `bugs.tsx`
- **Hook ordering**: Biome enforces `useHookAtTopLevel` — early returns (like auth guards) must come AFTER all hooks,
  not before
- **Pre-existing errors**: ~581 ruff errors and ~237 biome errors across the codebase — only verify new/modified files

## Seed Scripts

- Seed functions go in `backend/app/db/seed_*.py`, called from `init_db()` in `session.py`
- Must be idempotent (check `count > 0` before inserting)

## Context7 IDs

FastAPI=/tiangolo/fastapi, Beanie=/BeanieODM/beanie, Anthropic=/anthropics/anthropic-sdk-python, React=/facebook/react, TanStack-Router=/TanStack/router, TanStack-Query=/TanStack/query, MUI=/mui/material-ui, Zustand=/pmndrs/zustand, Pydantic=/pydantic/pydantic, Motor=/mongodb/motor, python-okx=/okx/python-okx, OpenAI=/openai/openai-python, Biome=/biomejs/biome, Vite=/vitejs/vite, Framer-Motion=/framer/motion
