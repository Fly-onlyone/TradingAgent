---
tags: [operations]
---

# Build Commands

> Canonical command table from project CLAUDE.md.

## What it does

| Task | Command |
|---|---|
| Install backend deps | `uv sync` |
| Install frontend deps | `cd frontend && bun install` |
| Install git hooks | `uv run pre-commit install` |
| Run dev server (backend) | `uv run python run.py` |
| Run dev server (frontend) | `cd frontend && bun run dev` |
| Test backend | `uv run pytest` |
| Test frontend | `cd frontend && bun run test` |
| Lint backend | `uv run ruff check` |
| Lint frontend | `cd frontend && bun run lint` |
| Format backend | `uv run ruff format` |
| Format frontend | `cd frontend && bun run format` |
| Check frontend | `cd frontend && bun run check` |

Backend uses `uv` (Python 3.11+). Frontend uses `bun`.

## Gotchas

- After PyCharm reformat (spaces), run `bun run check` (`biome check --write`) to reconcile back to tabs
- Backend dev port is 7001, sidecar port is 7000

## See also

- [[_index]]
- [[Dev Server Architecture]]
- [[Pre-commit Hooks]]
