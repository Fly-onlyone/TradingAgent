---
tags: [desktop, operations, release]
---

# Desktop Release Pipeline

> Velopack builds the installer and update packages. Release Please owns the version. The release
> job is **off** until the repository variable `DESKTOP_RELEASE_ENABLED` is `true`.

## What it does

- **Version**: `<Version>` in `Directory.Build.props`, updated by Release Please (an XML
  extra-file in `release-please-config.json`). Do not edit it by hand.
- **`.github/workflows/desktop-package.yml`** publishes the app (Native AOT, win-x64) and runs
  `vpk pack` with package id `Fly.TradingAgent`. It runs three ways:
  - by hand (`workflow_dispatch`): packages are kept as a workflow artifact;
  - on a pull request that changes the workflow file: same, as a test of the packaging step;
  - called by `release-please.yml` with a release tag: packages are also attached to that GitHub
    release.
- **`.github/workflows/release-please.yml`** has the job `desktop-release`. It runs in the same
  workflow run that created the release, because a tag pushed with `GITHUB_TOKEN` does not start
  other workflows.
- **Updates in the app** (`VelopackUpdateService`): checks GitHub Releases 30 seconds after start
  and every 6 hours, downloads in the background, and applies the update on exit or from
  "Restart to update". It never restarts the app on its own.

## Secrets and variables

| Name | Kind | Effect when missing |
|---|---|---|
| `DESKTOP_RELEASE_ENABLED` | variable | Release job is skipped |
| `SENTRY_DSN` | secret | The build sends no crash reports |
| `SENTRY_AUTH_TOKEN` | secret | Debug symbols are not uploaded; crash reports show no line numbers |
| `WINDOWS_SIGN_PARAMS` | secret | Packages are unsigned; SmartScreen warns on first install |

## Gotchas

- Keep `VPK_VERSION` in the workflow equal to the Velopack package version in
  `Directory.Packages.props`.
- Debug symbols are built only when the workflow uploads them (a real release), and are deleted
  from the publish folder afterwards. The workflow fails if a `.pdb` is left.
- To test the update flow without publishing, set `TRADINGAGENT_UPDATE_SOURCE` to a folder of
  packages before starting an installed copy.
- The install folder is `%LOCALAPPDATA%\Fly.TradingAgent\`; data is elsewhere
  ([[Desktop Data Folder]]), so an uninstall keeps it.
- `tauri-build.yml` still builds the old app. It goes away with the old app.

## See also

- [[_index]]
- [[Release Please Workflow]]
- [[Desktop Crash Reporting]]
- [[Desktop Shell Behaviour]]
