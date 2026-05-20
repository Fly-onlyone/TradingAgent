---
tags: [operations]
---

# Dev Server Architecture

> `run.py` orchestrates frontend + backend in dev — it uses `watchfiles.watch()` + `subprocess.Popen`, NOT `uvicorn --reload`.

## What it does

- Spawns the backend uvicorn process directly via `subprocess.Popen`
- Watches Python source files via `watchfiles.watch()` and restarts the child on change
- Also boots the Vite frontend in parallel

## Why not `uvicorn --reload`?

Uvicorn's reloader uses `multiprocessing.spawn`, which creates child processes with `SelectorEventLoop` BEFORE app code runs. The Claude Agent SDK requires `ProactorEventLoop` to spawn subprocesses on Windows.

Both `run.py` and `backend/app/main.py` set `WindowsProactorEventLoopPolicy()` at module level — keep this policy set before any `asyncio.run()` in new entry points.

## Gotchas

- New entry points (CLI scripts, workers) must set the proactor policy before `asyncio.run`
- Without proactor, [[ClaudeSDKClient]] subprocess spawn silently fails

## See also

- [[_index]]
- [[Backend Port 7000 vs 7001]]
- [[ProactorEventLoop]]
