---
tags: [backend, core, platform]
---

# Windows Event Loop

> Set `WindowsProactorEventLoopPolicy()` **at module top level** in every entry point — `SelectorEventLoop` cannot spawn subprocesses, which the Claude Agent SDK needs.

## Source

- `run.py:25`
- `backend/app/main.py:16`
- `backend/desktop_entry.py:9`

```python
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
```

## How it works

Python on Windows defaults to `ProactorEventLoop` in 3.8+ for the *main* thread, but uvicorn `--reload` and certain `multiprocessing.spawn` flows create new event loops that fall back to `SelectorEventLoop`, which cannot run `subprocess.create_subprocess_*`. The Claude Agent SDK shells out to the `claude` CLI, so the policy MUST be `Proactor`. Each entry point sets the policy *before* importing anything that might create a loop. The dev runner (`run.py`) avoids uvicorn `--reload` for the same reason, using `watchfiles.watch()` + `subprocess.Popen` instead.

## Depends on

- [[ProactorEventLoop]]

## Used by

- [[Background Service Startup]]
- Claude Agent SDK invocations (subagents, [[TradingAgent]])

## Gotchas

- Setting it inside `asyncio.run()` is too late — the loop already exists. **Must** be at module top level.
- Linux/macOS branches are no-ops; the policy is gated on `sys.platform == "win32"`.

## See also

- [[_index]]
- [[Background Service Startup]]
