---
tags: [operations]
---

# Commit Type Filter

> Which commit types appear in the auto-generated CHANGELOG.

## What it does

Visible in CHANGELOG (configured in `release-please-config.json`):

- `feat`
- `fix`
- `perf`
- `revert`
- `deps`
- `refactor`

Hidden (`hidden: true`):

- `docs`, `test`, `build`, `ci`, `chore`, `style`

## Why

The CHANGELOG should communicate user-facing or shipping-relevant changes. Internal chores and doc tweaks clutter the release notes.

## Gotchas

- Hidden commits still trigger version bumps based on type (e.g. `feat` → minor, `fix` → patch)
- Use `feat!` or `BREAKING CHANGE:` footer to force a major bump

## See also

- [[_index]]
- [[Conventional Commits]]
- [[Release Please Workflow]]
