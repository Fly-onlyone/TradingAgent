---
tags: [frontend, components, agent]
---

# AgentTable

> MUI-styled markdown table components (MdTable / MdThead / MdTbody / MdTr / MdTh / MdTd) injected into the chat message renderer.

## Source

- `frontend/src/components/agent/AgentTable.tsx`

## How it works

When the assistant streams markdown containing a table, the `ChatMessage`
markdown renderer maps the raw HTML elements to these MUI-wrapped equivalents:
`TableContainer` with overflow-x scrolling, `Table size="small"`, themed
`TableHead` (action.hover background), and bordered rows. The wrapper limits
maxWidth to keep tables from blowing out the chat column.

## Depends on

- `@mui/material` Table primitives

## Used by

- `ChatMessage.tsx` (markdown component overrides)
- [[Agent Route]]

## See also

- [[Agent Components]]
- [[ToolCallList]]
