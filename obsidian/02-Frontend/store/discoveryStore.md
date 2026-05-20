---
tags: [frontend, store, discovery]
---

# discoveryStore

> Background runner for the Strategy Discovery "Run Now" SSE stream. Survives navigation so progress isn't lost.

## Source

- `frontend/src/store/discoveryStore.ts`

## How it works

`startRun(token)` POSTs `/api/v1/settings/strategy-discovery/run-now` and pipes the response body through a `ReadableStreamReader`, parsing `data: ...` SSE lines into `ProgressEvent`s. Each event is formatted into a human-readable line in `progressMessages`. Explorer subagent's `explorer_session_id` is captured into `currentExplorerSessionId` so the UI can deep-link to the chat session. On `complete`, the store builds a summary string and fires a [[uiStore|notify]] toast (`success`/`info`). `reset()` aborts the in-flight `AbortController`.

## Gotchas

- Fire-and-forget; the run keeps streaming even if the component unmounts.

## See also

- [[_index]]
- [[Strategy Discovery Admin Endpoints]]
- [[Chat-Session Lifecycle]]
