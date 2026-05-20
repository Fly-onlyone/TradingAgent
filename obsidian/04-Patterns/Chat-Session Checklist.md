---
tags: [pattern]
---

# Chat-Session Checklist

> 10-leg checklist for any feature that writes `AgentSessionMessage` documents. DB write is necessary but NOT sufficient.

## When to apply

Any feature that creates an [[Chat-Session Lifecycle]] entry: subagents, background cycles, scheduled agents, AI merge, strategy discovery, etc.

## The pattern

| Leg | Requirement |
|---|---|
| Persistence | Use [[persist_session_message Pattern]] |
| Live stream | Broadcast WebSocket `type: "message"` on every insert |
| Sidebar spinner | Set `keep_running: true` for multi-message runs; clear on final |
| In-place updates | Mutate existing doc + emit `message_updated` for state transitions |
| Message id on wire | `id` must be on REST + WS payloads (24-char hex) |
| Suppress Claude hooks | `extra_args={"setting-sources": "local"}` on every `ClaudeAgentOptions` |
| Completion toast | Fire `TASK_COMPLETED` / `TASK_FAILED` via [[Notification Service]] |
| Failure visibility | Try/except wraps cycle; flip running→failed; orphan startup hook |
| UI surfaces | Animated spinner + click-through `setSelectedSessionId(id)` + navigate |
| Strategy shadow | Create matching `Strategy` doc owned by a real user — see [[Strategy Shadow Doc Pattern]] |

## Why

Skipping any leg leaves a visible UI gap: missing messages, stuck spinners, orphan rows, or unfindable strategies.

## Don't

- Don't create a separate `AgentSession` per subagent — subagents are pure compute
- Don't pass `user_id=None` to strategy shadow creation — it silently skips

## See also

- [[_index]]
- [[Chat-Session Lifecycle]]
- [[persist_session_message Pattern]]
- [[setting-sources local Pattern]]
