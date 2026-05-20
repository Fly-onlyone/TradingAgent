---
tags: [architecture, flow]
---

# Trading Decision Flow

> End-to-end sequence from a user request to an executed order on OKX.

## Source

- `backend/app/agent/trading_agent.py` — main orchestrator
- `backend/app/agent/subagents/` — TechnicalAnalyst, FundamentalAnalyst, NewsAnalyst, RiskManager
- `backend/app/agent/subagents/order_executor.py` — risk-gated order placement

## How it works

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant API as FastAPI /agent/*
    participant Agent as TradingAgent
    participant TA as TechnicalAnalyst
    participant FA as FundamentalAnalyst
    participant NA as NewsAnalyst
    participant RM as RiskManager
    participant OE as OrderExecutor
    participant OKX as OKX Exchange

    User->>API: POST trading query
    API->>Agent: dispatch via ClaudeSDKClient
    Agent->>TA: delegate(chart patterns, indicators)
    TA-->>Agent: technical summary
    Agent->>FA: delegate(on-chain, valuations)
    FA-->>Agent: fundamental summary
    Agent->>NA: delegate(sentiment)
    NA-->>Agent: news summary
    Agent->>RM: delegate(position sizing, risk)
    RM-->>Agent: risk verdict + size
    Agent->>OE: place_order(symbol, side, size)
    OE->>OKX: signed request
    OKX-->>OE: order id + status
    OE-->>Agent: execution result
    Agent-->>API: structured response
    API-->>User: analysis + execution status
```

Each subagent is **pure compute** — receives a dict, returns a dict, owns no
`AgentSession`. The parent session captures the timeline via tool-call bubbles. See
[[Subagent Delegation Pattern]] for the contract.

## Depends on

- [[TradingAgent]] — orchestrator
- [[ClaudeSDKClient Wrapper]] — driver
- [[TechnicalAnalyst]], [[FundamentalAnalyst]], [[NewsAnalyst]], [[RiskManager]]
- [[OrderExecutor]]
- [[OKX Exchange]] (integration)

## Used by

- [[Agent Sessions Endpoints]] (REST entry point)
- [[Agent WS Channel]] (streaming variant)

## Gotchas

- Risk-gated: if [[RiskManager]] vetoes, [[OrderExecutor]] never fires.
- All subagent calls happen inside the parent session — orphaned subagent sessions are a bug.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]] — knowledge tools enrich subagent reasoning
- [[Chat-Session Checklist]] — every leg required when persisting this flow
