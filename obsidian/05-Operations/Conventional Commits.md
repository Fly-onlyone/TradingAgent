---
tags: [operations]
---

# Conventional Commits

> Required commit format — enforced by CI and pre-commit.

## What it does

- PR titles linted by `.github/workflows/commitlint.yml` (squash-merge → PR title becomes the commit message)
- Per-commit format enforced locally via `conventional-pre-commit`
- Accepted types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, `style`, `deps`

## Setup

- Install hooks: `uv run pre-commit install`
- The hook runs `conventional-pre-commit` on every commit

## Gotchas

- Squash-merge in GitHub takes the **PR title** — make sure it's a conventional commit message
- Only some types appear in CHANGELOG — see [[Commit Type Filter]]

## See also

- [[_index]]
- [[Release Please Workflow]]
- [[Pre-commit Hooks]]
- [[Commit Type Filter]]
