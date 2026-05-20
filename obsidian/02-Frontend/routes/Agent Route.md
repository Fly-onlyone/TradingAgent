---
tags: [frontend, routes]
---

# Agent Route

> `/agent` — full-height chat surface with sessions sidebar, message stream, and live tool calls.

## Source

- `frontend/src/routes/agent.tsx`

## How it works

`requireAuth()` guard. [[AppShell]] disables vertical scrolling for this path so
the chat owns its scroll. Layout is `[SessionList | (ChatMessages + ChatInput)]`.
WebSocket hookup goes through [[useAgentSocket]], which dedups messages by their
24-char hex DB `id` (DB wins) per [[Chat-Session Checklist]]. `keep_running` on
incoming messages drives the in-flight spinner in [[SessionList]].

## Depends on

- [[Agent Components]]
- [[useAgentSocket]]
- [[agentStore]]

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[Agent WS Channel]]
