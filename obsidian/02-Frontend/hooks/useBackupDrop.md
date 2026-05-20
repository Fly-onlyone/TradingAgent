---
tags: [frontend, hooks, tauri]
---

# useBackupDrop

> Unified drag-and-drop for backup JSON files that works in both browser (HTML5) and Tauri desktop modes.

## Source

- `frontend/src/hooks/useBackupDrop.ts`

## How it works

Returns `isDragging` + `dndHandlers` to spread on the drop zone. In browser mode HTML5 `onDrop` reads `e.dataTransfer.files`. In Tauri, the webview intercepts native drops globally — so the hook conditionally `import()`s `@tauri-apps/api/webview` + `@tauri-apps/plugin-fs`, subscribes via `getCurrentWebview().onDragDropEvent`, reads the path with `readFile`, and wraps the bytes into a synthetic `File` object so the consumer's `onFile` callback receives the same shape regardless of platform. Only `.json` extensions are accepted.

## Depends on

- `@/utils/tauriEnv` (`isTauri`)

## See also

- [[_index]]
- [[02-Frontend/tauri/_index|Tauri shell]]
