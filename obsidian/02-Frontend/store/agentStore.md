---
tags: [frontend, store, agent]
---

# agentStore

> Per-session chat runtime: messages, tool calls, thinking, streaming text, decisions, pending questions. Also holds the active run/selected session ids.

## Source

- `frontend/src/store/agentStore.ts`

## How it works

`sessionStates: Record<sessionId, SessionRuntimeState>` is the per-conversation buffer (bounded at 6 sessions via `pruneSessionStates`, protecting selected/active/thinking ones). `hydrateSessionMessages` merges REST fetches with WS-arrived rows: 24-hex DB ids win on collision (DB is canonical) and the rest dedup by a `${role}:${content}:${floor(ts/1000)}` key — see [[WebSocket Message Dedup]]. `createDraftSession` mints `draft-<uuid>`; `replaceSessionId` swaps it once the backend assigns a real id. `finalizeInterruptedTurns` flushes any in-flight streaming text into a synthetic assistant message when the socket dies. `persist` saves only the `showThinkingContent` + `expandAllTools` toggles.

## Used by

- [[useAgentSocket]]
- Agent route, chat sidebar, decision list

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[Chat-Session Lifecycle]]
