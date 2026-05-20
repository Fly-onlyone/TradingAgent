---
tags: [frontend, components, agent]
---

# ChatInput

> Claude.ai-style composer card with inline model / thinking / effort menus, context-usage bar, and quick-action pills.

## Source

- `frontend/src/components/agent/ChatInput.tsx`

## How it works

Textarea + bottom toolbar inside a glassmorphic card. The toolbar has three
[[useZoomAwareMenu]]-driven Menus (model, thinking mode, effort) backed by
`useAgentConfigMenus`. Settings persist via a React Query optimistic
`updateAgentConfig` mutation against `/api/v1/settings/agent`. A
`LinearProgress` bar shows token usage versus the model's context window
(`200k` Sonnet/Opus, `1M` for `1m` variants). Send/Stop button toggles based
on `isThinking`; quick-action pills (Analyze / Recommend / Strategies) call
optional callbacks.

## Depends on

- [[useAgentSocket]]
- [[useZoomAwareMenu]]
- [[React Query Options]]

## Used by

- [[Agent Route]]

## Gotchas

- Menu buttons use `useZoomAwareMenu` — never refactor to `anchorEl`.

## See also

- [[Agent Components]]
- [[CSS Zoom Handling]]
