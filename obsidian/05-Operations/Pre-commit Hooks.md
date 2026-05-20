---
tags: [operations]
---

# Pre-commit Hooks

> Git hooks installed via `pre-commit` framework — run lint, format, and commit-message checks before allowing a commit.

## What it does

- Runs Ruff lint + format on staged Python files
- Runs Biome on staged frontend files (via configured local hook)
- Runs `conventional-pre-commit` to enforce [[Conventional Commits]]

## Setup

```
uv run pre-commit install
```

Hook config lives in `.pre-commit-config.yaml` at the repo root.

## Gotchas

- If a hook auto-fixes a file, you must re-stage and commit again
- Never bypass with `--no-verify` unless the user explicitly asks — fix the underlying issue
- See [[Conventional Commits]] for accepted prefix types

## See also

- [[_index]]
- [[Conventional Commits]]
- [[Ruff Rules]]
- [[Biome Rules]]
