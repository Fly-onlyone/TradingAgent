---
tags: [frontend, components, agent]
---

# ToolCallList

> Stacked list of `ToolCall` bubbles inside one assistant turn, with a global expand-all toggle.

## Source

- `frontend/src/components/agent/ToolCallList.tsx`

## How it works

Receives `toolCalls: ToolCall[]` and an optional `expandAllTools` flag. Renders
a small header "Tools Used (N)" and maps each call to `ToolCallBlock`, passing
`forceExpanded={expandAllTools}` so the header-level toggle in [[Agent Route]]
can fan out to every bubble. Each `ToolCallBlock` shows tool name, input args,
result preview, and a collapse chevron.

## Depends on

- `ToolCallBlock.tsx`
- [[useAgentSocket]] (`ToolCall` type)

## Used by

- `ChatMessage.tsx`
- [[Agent Route]]

## See also

- [[Agent Components]]
- [[Chat-Session Checklist]]
