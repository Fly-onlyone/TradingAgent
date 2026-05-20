---
tags: [glossary]
---

# ProactorEventLoop

Windows-specific asyncio event loop that supports subprocess spawning. The default `SelectorEventLoop` does NOT, which is why both `run.py` and `backend/app/main.py` call `WindowsProactorEventLoopPolicy()` at module level before any `asyncio.run()`. [[ClaudeSDKClient]] requires it to spawn the Claude CLI subprocess. See [[Dev Server Architecture]].

## See also

- [[_index]]
- [[Dev Server Architecture]]
- [[ClaudeSDKClient]]
