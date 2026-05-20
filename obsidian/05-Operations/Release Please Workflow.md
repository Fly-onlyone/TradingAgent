---
tags: [operations]
---

# Release Please Workflow

> Push conventional commits to `master` → Release Please opens a `chore(release): vX.Y.Z` PR. Merge it to ship.

## What it does

- Workflow file: `.github/workflows/release-please.yml`
- Bumps versions in `pyproject.toml`, `frontend/package.json`, `frontend/src-tauri/Cargo.toml`, `frontend/src-tauri/tauri.conf.json`
- Updates `CHANGELOG.md`
- When the release PR is merged, the resulting tag push triggers `.github/workflows/tauri-build.yml` which attaches MSI/DMG/AppImage/deb bundles to the GitHub Release

## Setup

- Config: `release-please-config.json`
- Manifest: `.release-please-manifest.json` (source of truth for last-released version)

## Gotchas

- Do not hand-edit `CHANGELOG.md` or version strings — Release Please owns them
- See [[Commit Type Filter]] for which commit types surface in the changelog

## See also

- [[_index]]
- [[Release Please]]
- [[Conventional Commits]]
- [[Commit Type Filter]]
