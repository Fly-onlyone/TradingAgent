---
tags: [frontend, hooks, auth]
---

# usePollingLogin

> Generic poller: call `pollFn` every `interval` ms until it returns `true` (`onSuccess`) or `timeout` elapses (`onTimeout`).

## Source

- `frontend/src/hooks/usePollingLogin.ts`

## How it works

Defaults: 4s interval, 120s timeout. `startPolling()` flips an internal `isPolling` flag; the effect spins up `setInterval` + `setTimeout` and tears them down on cleanup or success. Errors thrown by `pollFn` are swallowed so a transient network hiccup doesn't abort the poll. Used for external login handshakes (e.g. Claude CLI / OAuth browser flows) where the backend signals readiness via a status endpoint rather than a redirect.

## See also

- [[_index]]
- [[useAuth]]
