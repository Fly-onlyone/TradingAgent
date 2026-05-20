---
tags: [moc, frontend]
---

# 02-Frontend — Map of Content

React 19 + Vite + TanStack (Router/Query) + Zustand + MUI 6, wrapped by Tauri v2 for
desktop distribution. CSS `zoom` is used for UI scaling — most pitfalls come from
forgetting to account for it.

## Modules

- [[02-Frontend/components/_index|components/]] — 50+ React components grouped by domain (agent, trading, trades, charts, common, effects, layout, settings, tasks)
- [[02-Frontend/routes/_index|routes/]] — TanStack file-based routing (`-guards.ts` middleware)
- [[02-Frontend/api/_index|api/]] — HTTP client + interceptor + snake→camel transformers + React Query options
- [[02-Frontend/websocket/_index|websocket/]] — `useWebSocket` + `useAgentSocket` hooks, reconnection, message dedup
- [[02-Frontend/store/_index|store/]] — Zustand stores (`auth`, `trade`, `order`, `task`, `market`, `log`, `discovery`, `ui`, `agent`)
- [[02-Frontend/hooks/_index|hooks/]] — Custom React hooks (`useAuth`, `useZoomAwareMenu`, `useUIScaleZoom`, `useDebouncedSave`, etc.)
- [[02-Frontend/theme/_index|theme/]] — MUI theme factory, palette, presets, MuiPopper/MuiTooltip zoom overrides
- [[02-Frontend/utils/_index|utils/]] — Validators, transformers, Tauri env detection, Sentry browser, frontend logger
- [[02-Frontend/animations/_index|animations/]] — Framer Motion variants (`pageEntrance`, `staggerCascade`, `scaleIn`, `slideIn`, `scrollReveal`, etc.) + spring configs + reduced-motion
- [[02-Frontend/tauri/_index|tauri/]] — Tauri v2 config, sidecar binary, IPC commands, capabilities, auto-updates

## Cross-references

- Architecture flows: [[00-Architecture/_index]]
- External integrations the frontend uses: [[03-Integrations/_index]]
- Frontend patterns to follow: [[04-Patterns/_index]] — especially [[CSS Zoom Handling]] and [[Framer Motion Variants]]
- Build / dev / debug operations: [[05-Operations/_index]]

## See also

- [[_HOME]]
