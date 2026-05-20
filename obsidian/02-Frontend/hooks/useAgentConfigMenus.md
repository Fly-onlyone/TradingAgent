---
tags: [frontend, hooks, agent]
---

# useAgentConfigMenus

> Bundles three [[useZoomAwareMenu]] instances — model, thinking mode, effort — into one struct with an `onSelect(value)` wired to a single `onUpdate(AgentConfigUpdate)`.

## Source

- `frontend/src/hooks/useAgentConfigMenus.ts`

## How it works

Each menu is a standard [[useZoomAwareMenu]] return enriched with `onSelect`. Selecting a model dispatches `onUpdate({ model })` then `handleClose()`; same shape for `thinkingMode` and `effort`. The caller renders three MUI `<Menu>`s and three `<MenuItem>`s per submenu.

## Depends on

- [[useZoomAwareMenu]]
- `@/api/endpoints/settings` (`AgentConfigUpdate`)

## Used by

- Agent header config dropdowns

## See also

- [[_index]]
- [[agentStore]]
