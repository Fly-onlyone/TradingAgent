---
tags: [frontend, store, moc]
---

# Store MOC

> Zustand stores under `frontend/src/store/` — UI state, persisted prefs, runtime caches.

## Pattern

- [[Zustand Stores Pattern]]

## Stores

- [[authStore]] — JWT + user, persisted
- [[uiStore]] — sidebar, theme, notifications, [[CSS Zoom Handling|uiScale]]
- [[tradeStore]] — Trades page filters/view
- [[orderStore]] — open orders + positions cache
- [[taskStore]] — selected task id
- [[marketStore]] — tickers, candles, watchlist (partial persist)
- [[logStore]] — Log viewer filters
- [[discoveryStore]] — Run-Now SSE progress
- [[agentStore]] — chat sessions, decisions, runtime

## See also

- [[Zustand]]
- [[useAuth]]
- [[useAppTheme]]
