---
tags: [operations]
---

# Backend Port 7000 vs 7001

> Backend dev port is **7001**; sidecar (Tauri production) port is **7000**.

## What it does

- `uv run python run.py` → port **7001** (development with reload)
- `uv run python run.py --serve` → port **7000** (production sidecar launched by Tauri)
- Decision logic lives in `run.py:32`

## Gotchas

- Frontend dev (`bun run dev` on port 3000) proxies to **7001** in dev mode
- Production Tauri build talks to the [[Sidecar Binary]] on **7000**
- Mixing the two yields confusing 404s when manually testing

## See also

- [[_index]]
- [[Dev Server Architecture]]
- [[Sidecar]]
