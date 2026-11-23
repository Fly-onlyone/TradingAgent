---
tags: [desktop, operations, gotcha]
---

# Desktop Build Gotchas

> Traps that cost a failed build or a failed pull-request check while the skeleton was built.

## Gotchas

- **The SDK is pinned exactly.** `global.json` says `10.0.404` with `rollForward: disable`,
  because the Native AOT compiler packs in the lock files follow the SDK version. An SDK bump must
  regenerate the lock files: `dotnet restore TradingAgent.slnx --force-evaluate`.
- **Lock files.** Every project has a `packages.lock.json`, and CI restores with `--locked-mode`.
  After changing a package or a target framework, run a plain `dotnet restore`, commit the lock
  files, and check that `--locked-mode` passes.
- **Warnings are errors**, analyzer and style warnings included. `dotnet format --verify-no-changes`
  is a CI step.
- **Native AOT link fails with `'vswhere.exe' is not recognized`** when the environment variable
  `NoDefaultCurrentDirectoryInExePath` is set, which some agent shells do. Clear it before
  `dotnet publish`.
- **A Sentry token in the environment.** The Sentry package can upload debug symbols during a
  build. The project allows that only with `-p:UploadSentrySymbols=true`, which only the release
  workflow passes. Never add an unconditional `SentryUploadSymbols=true`.
- **No `.pdb` may ship.** SkiaSharp and HarfBuzz bring about 100 MB of native `.pdb` files; the
  project deletes every `.pdb` from the publish folder (target `DropNativePdb`), and the package
  workflow fails if one is left.
- **Sentry 7.0.1 does not switch on its Native AOT symbol upload by itself.** It computes
  `_SentryIsNet8OrGreater` in a `.props` file, before the target framework of a single-target
  project is known. `TradingAgent.App.csproj` sets the property itself. On a Sentry upgrade, check
  whether that line can go: `dotnet msbuild src/TradingAgent.App -p:_IsPublishing=true
  -getProperty:SentryCLIUploadNativeAOT` must print `true`.
- **A wrong or expired `SENTRY_AUTH_TOKEN` does not fail the release build.** Sentry prints a
  warning and skips the upload; crash reports then lack file names and line numbers.
- **`Sentry.Profiling` does not build under Native AOT** (IL2104, IL3053). It is left out.
- **`ItemsControl` with a custom template does not virtualize.** Use `ListBox` for long lists.
- **Window position is in physical pixels, size in DIPs.** Scale by the screen's scaling.
- **Pull-request titles**: the subject after `type(scope):` must start lowercase (commitlint).
- **Version files** (`Directory.Build.props` `<Version>`) are owned by Release Please. Do not edit.

## See also

- [[_index]]
- [[Desktop Build Commands]]
- [[Desktop Release Pipeline]]
