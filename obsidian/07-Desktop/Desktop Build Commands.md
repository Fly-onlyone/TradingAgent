---
tags: [desktop, operations]
---

# Desktop Build Commands

> Commands for the native app. Run them from the repository root.

| Task | Command |
|---|---|
| Restore | `dotnet restore TradingAgent.slnx` |
| Restore as CI does | `dotnet restore TradingAgent.slnx --locked-mode` |
| Build | `dotnet build TradingAgent.slnx` |
| Run (Debug) | `dotnet run --project src/TradingAgent.App` |
| Test | `dotnet test TradingAgent.slnx` |
| Format | `dotnet format TradingAgent.slnx` |
| Format check as CI does | `dotnet format TradingAgent.slnx --verify-no-changes` |
| Publish (Native AOT) | `dotnet publish src/TradingAgent.App/TradingAgent.App.csproj -c Release -r win-x64 -o publish` |

## What it does

- **Debug** builds exit when the window closes, show "(dev)" in the title, and use their own data
  folder and app identity, so a development run cannot touch an installed copy.
- **Release** builds close to the tray and keep running.
- The CI job `Desktop — Build, Test & Publish` in `.github/workflows/ci.yml` runs restore
  (locked), format check, build, test and the Native AOT publish on `windows-latest`. The publish
  step is the AOT-compatibility gate.

## Gotchas

- Open `TradingAgent.slnx` in Rider as a **solution**. Opened as a folder, Rider does not analyze C#.
- Publishing needs the Visual Studio C++ build tools (the Native AOT linker).
- More traps: [[Desktop Build Gotchas]].

## See also

- [[_index]]
- [[Desktop Solution Layout]]
- [[Build Commands]]: the previous app (history)
