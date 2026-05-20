---
tags: [operations]
---

# Biome Rules

> Frontend lint and format tool — successor to ESLint + Prettier.

## What it does

Enforced patterns:

- **Tabs**, not spaces (PyCharm formatter uses spaces — always run `bun run check` after)
- **Double quotes**
- **Sorted imports**
- `noArrayIndexKey` — even loading skeletons must use stable string keys
- `useHookAtTopLevel` — early returns (auth guards) must come AFTER all hooks

## Setup

```
cd frontend
bun run lint        # biome lint
bun run format      # biome format
bun run check       # biome check --write (combined)
```

Context7 ID: `/biomejs/biome`.

## Gotchas

- PyCharm's reformatter inserts spaces — always run `bun run check` to reconcile
- `useHookAtTopLevel` violations are easy to introduce when adding auth guards — put hooks first, return-checks after

## See also

- [[_index]]
- [[Ruff Rules]]
