---
tags: [frontend, components, agent]
---

# Agent Components

> Chat surface for the [[TradingAgent]] — input, message stream, tool calls, decisions.

## Source

- `frontend/src/components/agent/`

## Members

- [[AgentTable]] — markdown-table renderer (MdTable/Thead/Tbody/Tr/Th) used inside chat messages
- `AgentChart.tsx` — markdown image / chart embed inside chat
- `AgentStatusBadge.tsx` — running/idle/error chip
- `AgentConfigPanel.tsx` — inline model/thinking/effort config
- `AskUserBlock.tsx` — renders an `ask_user` interactive prompt
- `ChatMessage.tsx` — assistant/user message bubble with markdown
- [[ChatInput]] — composer card with model/thinking/effort menus and context bar
- [[DecisionCard]] — buy/sell/hold/wait decision render with execute button
- `DecisionHistoryPanel.tsx` — list of past `AgentDecision`s
- [[SessionList]] — sidebar of grouped sessions
- `ThinkingIndicator.tsx` — animated dots while streaming
- `ToolCallBlock.tsx` — one collapsible tool invocation
- [[ToolCallList]] — list of tool calls inside one assistant turn

## Depends on

- [[useAgentSocket]]
- [[agentStore]]
- [[Chat-Session Checklist]]

## See also

- [[_index]]
- [[Agent WS Channel]]
