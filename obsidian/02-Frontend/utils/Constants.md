---
tags: [frontend, utils]
---

# Constants

> Centralized magic values: API base, pagination sizes, timeframes, order types, popular pairs, sentiment thresholds, shortcuts, storage keys.

## Source

- `frontend/src/utils/constants.ts`

## How it works

Exported `as const` to keep literal types:

- **API** — `API_BASE_URL = "/api/v1"`, `WS_BASE_URL = "/ws"` (browser dev defaults; the runtime versions come from [[Tauri Env Detection]])
- **Pagination** — `DEFAULT_PAGE_SIZE = 20`, `PAGE_SIZE_OPTIONS = [10, 20, 50, 100]`
- **Trading** — `DEFAULT_SYMBOL = "BTC-USDT"`, `TIMEFRAMES`, `ORDER_TYPES`, `ORDER_SIDES`, `ORDER_STATUSES`, `POPULAR_PAIRS`
- **Visual** — `CHART_COLORS` (fallback only — prefer `theme.trading.colors`), `CREDIBILITY_LEVELS`, `SENTIMENT_THRESHOLDS`
- **Agent** — `AGENT_ACTIONS`, `ANALYSIS_TYPES`, `PATTERN_TYPES`
- **UX** — `SHORTCUTS`, `STORAGE_KEYS`, `ANIMATION` (durations in ms)

## Used by

- Forms, dropdowns, hotkey handlers, store persistence keys

## See also

- [[MUI Theme]]
