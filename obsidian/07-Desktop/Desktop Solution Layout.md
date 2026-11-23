---
tags: [desktop, architecture]
---

# Desktop Solution Layout

> Six projects under `src/`, five test projects under `tests/`, one solution file
> `TradingAgent.slnx` at the repository root.

## Projects

| Project | Target | Holds |
|---|---|---|
| `src/TradingAgent.Core` | `net10.0` | Domain types, setting keys, interfaces (`ISettingsStore`, `ISecretStore`, `IToastNotifier`, `IAutostart`, `IUpdateService`), `Redactor`, `SingleInstanceGuard`. No UI and no IO packages |
| `src/TradingAgent.Data` | `net10.0` | SQLite: `Database`, `MigrationRunner`, settings and secret stores, log sinks, `RetentionService` |
| `src/TradingAgent.Exchange` | `net10.0` | Read-only OKX client, technical indicators, risk score (see [[Exchange and Risk]]) |
| `src/TradingAgent.Agent` | `net10.0` | Model providers, the tool-use loop, tools and gates, runs (see [[Agent Runs]]) |
| `src/TradingAgent.Platform.Windows` | `net10.0-windows10.0.19041.0` | DPAPI, toasts, start-up shortcut, app identity (AUMID) |
| `src/TradingAgent.App` | `net10.0-windows10.0.19041.0`, `WinExe`, `PublishAot` | Avalonia UI, composition root (`ShellApp`), shell, updates, telemetry |

Tests: `tests/TradingAgent.Core.Tests`, `tests/TradingAgent.Data.Tests`,
`tests/TradingAgent.Exchange.Tests`, `tests/TradingAgent.Agent.Tests`, `tests/TradingAgent.App.Tests` (xUnit v3; the App tests use
`Avalonia.Headless.XUnit`).

## Root files

- `global.json` pins the SDK exactly (`rollForward: disable`).
- `Directory.Build.props` holds the version (owned by Release Please), nullable, analyzers and
  warnings-as-errors.
- `Directory.Packages.props` holds every package version (central package management).
- `src/Directory.Build.props` marks the source projects AOT-compatible and fixes
  `RuntimeIdentifiers=win-x64`.
- `.editorconfig` holds the C# style that `dotnet format` enforces.

## Rules

- **Dependency direction**: App → Agent → Data → Core, Agent → Exchange → Core, and App → Platform.Windows → Core. Core
  references nothing of ours.
- **A new platform is a new project**, not edits to features: implement the Core interfaces in
  `TradingAgent.Platform.<Name>` and register them in `ShellApp`.
- **Everything must be Native AOT-safe**: compiled bindings, a switch-based `ViewLocator` (no
  reflection), source-generated JSON (`JsonSerializerContext`), source-generated COM and
  `[LibraryImport]`, `[LoggerMessage]` for logging. Trim and AOT warnings are build errors.
- **No generic host.** `ShellApp` builds a plain `ServiceCollection`.
- **View models** use CommunityToolkit.Mvvm partial properties (`[ObservableProperty]`).

## See also

- [[_index]]
- [[Desktop Build Commands]]
- [[Native Rewrite Decisions]]
