---
tags: [integrations]
---

# Release Please

> Automated version bumping driven by [[Conventional Commits]] — opens a PR that updates versions and CHANGELOG.

## Used for

- Bumping `pyproject.toml`, `frontend/package.json`, `frontend/src-tauri/Cargo.toml`, `frontend/src-tauri/tauri.conf.json`
- Maintaining `CHANGELOG.md` automatically
- Triggering `tauri-build.yml` on the resulting tag push to publish desktop bundles

## Configuration

- Workflow: `.github/workflows/release-please.yml`
- Config: `release-please-config.json`
- Manifest: `.release-please-manifest.json` (source of truth for the last-released version)

## Gotchas

- Never hand-edit `CHANGELOG.md` or version strings — Release Please owns them
- Only `feat`, `fix`, `perf`, `revert`, `deps`, `refactor` appear in the changelog; other types are hidden

## See also

- [[_index]]
- [[Release Please Workflow]]
- [[Conventional Commits]]
