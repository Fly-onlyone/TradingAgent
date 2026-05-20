---
tags: [architecture, websocket]
---

# WebSocket Connection Manager

> Per-user channel registry that powers agent / market / orders streams.

## Source

- `backend/app/api/websocket/connection_manager.py` — `manager.connect / disconnect / send_to_user`
- `backend/app/api/websocket/agent.py` — agent stream + `_agent_channel_user_id`
- `backend/app/api/websocket/market.py`, `orders.py`

## How it works

```mermaid
graph LR
    subgraph Client
        UI[React UI]
        useWS[useWebSocket hook]
    end
    subgraph Server
        Agent[/ws/agent]
        Market[/ws/market]
        Orders[/ws/orders]
        CM[ConnectionManager]
    end
    UI --> useWS --> Agent
    useWS --> Market
    useWS --> Orders
    Agent --> CM
    Market --> CM
    Orders --> CM
    CM -. broadcast .-> Agent
    CM -. broadcast .-> Market
    CM -. broadcast .-> Orders
```

The manager keeps a `user_id → WebSocket` map. Agent channels are keyed by
`_agent_channel_user_id(user_id)` (a derived key) so multiple tabs of the same user
share a logical channel.

## Broadcast helpers

- `manager.send_to_user(channel_id, payload)` — primary
- Pattern for live sessions: payload includes outer `session_id` + `type: "message"` (see [[Chat-Session Checklist]])
- `keep_running: true` flag tells the frontend to keep the sidebar spinner active

## Depends on

- [[useWebSocket Hook]] (client side)
- [[useAgentSocket]] (agent-specific wrapper)

## Used by

- [[Subagent Delegation Pattern]] — live tool-call bubbles
- [[Strategy Auto-Discovery Cycle]] — progress streaming
- Market ticker, order updates

## Gotchas

- Multi-tab users: derive the channel id from `user_id`, not the connection — otherwise tabs miss broadcasts.
- Always emit a final message *without* `keep_running` to clear the sidebar spinner.

## See also

- [[_index]]
- [[Chat-Session Checklist]]
