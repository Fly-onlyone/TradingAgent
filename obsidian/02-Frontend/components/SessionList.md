---
tags: [frontend, components, agent]
---

# SessionList

> Chat history sidebar — groups sessions by date, marks the active run, supports rename / delete.

## Source

- `frontend/src/components/agent/SessionList.tsx`

## How it works

Accepts pre-grouped `SessionsByDateGroup[]` (Today / Yesterday / This Week / ...)
and renders collapsible buckets. Each row shows the session title, a chat icon,
and an overflow menu (rename, delete). `activeRunSessionId` from [[uiStore]]
drives a spinner on sessions currently streaming. Per the
[[Chat-Session Checklist]], the spinner clears when a final non-`keep_running`
message arrives over the [[Agent WS Channel]].

## Depends on

- [[uiStore]]
- [[useAgentSocket]]
- `AgentSession` / `SessionsByDateGroup` types

## Used by

- [[Agent Route]]

## Gotchas

- Per-row context menus use [[useZoomAwareMenu]] — see [[CSS Zoom Handling]].

## See also

- [[Agent Components]]
