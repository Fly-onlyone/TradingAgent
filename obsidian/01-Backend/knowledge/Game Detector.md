---
tags: [backend, knowledge]
---

# Game Detector

> Defers CPU-heavy embedding work while configured game executables are running —
> a courtesy gate to keep latency-sensitive games unaffected.

## Source

- `backend/app/knowledge/game_detector.py`

## How it works

`is_game_running(process_names)` runs `psutil.process_iter(["name"])` inside
`asyncio.to_thread()` and case-insensitively matches against the configured
list (e.g. `["cs2.exe", "valorant.exe"]`). `wait_for_game_exit()` polls every
`check_interval_minutes` (clamped ≥ 1 min) and returns once no listed process
is alive. Other async tasks keep running while this coroutine awaits.

The hook lives on `EmbeddingService._wait_if_gaming()`: when
`AppSettings.defer_embedding_when_gaming` is true and
`AppSettings.gaming_process_list` is non-empty, every
`generate_document_embedding()` call awaits this gate first.
Query embeddings are NOT deferred (interactive path).

## Depends on

- `psutil`
- [[App Settings]] (`defer_embedding_when_gaming`, `gaming_process_list`, `gaming_check_interval_minutes`)

## Used by

- [[Local Embeddings]] (document embeddings only)

## See also

- [[_index]]
