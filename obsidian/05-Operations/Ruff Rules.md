---
tags: [operations]
---

# Ruff Rules

> Backend lint and format tool — enforces modern Python style.

## What it does

Selected rule families: `E`, `F`, `I`, `N`, `W`, `UP` (target `py311`).

Enforced patterns:

- `X | None` instead of `Optional[X]`
- `datetime.UTC` instead of `timezone.utc`
- Sorted imports (`I` — isort-compatible)
- Naming conventions (`N`)

Line length 100; `E501` is ignored.

## Setup

```
uv run ruff check         # lint
uv run ruff check --fix   # auto-fix
uv run ruff format        # format
```

Config lives in `pyproject.toml` under `[tool.ruff]` / `[tool.ruff.lint]`.

## Gotchas

- Run BEFORE pushing — pre-commit will reject otherwise
- After PyCharm reformat the file, Biome (frontend) and Ruff disagree on whitespace styles — they only fight on frontend files

## See also

- [[_index]]
- [[Biome Rules]]
- [[Pre-commit Hooks]]
