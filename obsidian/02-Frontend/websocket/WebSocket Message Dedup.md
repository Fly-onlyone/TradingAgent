---
tags: [frontend, websocket, agent]
---

# WebSocket Message Dedup

> The frontend dedups agent messages by 24-char hex MongoDB ObjectId — DB always wins. A semantic fallback covers legacy / non-DB messages.

## Source

- `frontend/src/store/agentStore.ts` (`hydrateSessionMessages`)
- `frontend/src/api/websocket/useAgentSocket.ts` (`recentIncomingMessageKeysRef`)

## How it works

When merging REST history with WS-arrived rows, `hydrateSessionMessages` partitions by `isDbId = /^[a-f\d]{24}$/i`. DB-id messages collide-resolve REST-wins (DB is canonical for any row that may have been mutated server-side); non-DB messages dedup on `${role}:${content}:${floor(ts/1000)}`. Local-only WS messages without a DB id yet are preserved. The WS handler also keeps a 30-second sliding window of incoming `assistant`/`system` keys to drop replays that come through the socket after a reconnect or after a REST hydrate.

## Why

Reconnects can replay buffered events; REST fetches can race with new WS messages. Without this, the chat would double up.

## See also

- [[_index]]
- [[agentStore]]
- [[Chat-Session Checklist]]
