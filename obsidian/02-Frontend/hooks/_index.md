---
tags: [frontend, hooks, moc]
---

# Hooks MOC

> Custom React hooks under `frontend/src/hooks/`.

## Auth & queries

- [[useAuth]] — login/register/logout flow
- [[usePollingLogin]] — poll an external login flow
- [[useRecoverableQueryState]] — suppress transient errors during backend reconnect

## Forms / mutations

- [[useDebounce]]
- [[useDebouncedSave]]
- [[useMutationSaveStatus]]

## Zoom-aware UI

- [[useZoomAwareMenu]] — replacement for anchorEl-based MUI Menu
- [[useUIScaleZoom]] — Ctrl+wheel zoom + apply CSS zoom to `<html>`

## Theme / data

- [[useAppTheme]]
- [[useSymbolOptions]]

## Motion effects

- [[useTilt]]
- [[useMagneticHover]]

## Misc

- [[useAgentConfigMenus]]
- [[useBackupDrop]]

## See also

- [[CSS Zoom Handling]]
- [[uiStore]]
