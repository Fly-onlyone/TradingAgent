---
tags: [frontend, components, tasks]
---

# Tasks Components

> UI for the scheduled task page — trading cycle, monitoring loop, general config.

## Source

- `frontend/src/components/tasks/`

## Members

- `TaskActionBar.tsx` — run-now / pause / cancel buttons
- `TaskStatStrip.tsx` — last-run / next-run / success-rate strip
- `TaskSectionTabs.tsx` — tabbed selector across Trading / Monitoring / General / Schedule
- `TaskRunningProgress.tsx` — live progress bar for the active cycle
- `RecentRunsPanel.tsx` — last N runs with status + duration
- `SuccessFailureBar.tsx`, `DuplicateTasksBanner.tsx` — health indicators
- `TaskConfigContext.tsx` — React context shared between sections
- `sections/TradingSection.tsx` — trading-cycle config (symbols, intervals)
- `sections/MonitoringSection.tsx` — monitoring/scan config
- `sections/GeneralSection.tsx`, `sections/ScheduleSection.tsx`, `sections/ScheduleTimeline.tsx`
- `sections/GlassAccordion.tsx` — themed accordion wrapper

## Depends on

- [[taskStore]]
- [[React Query Options]]

## See also

- [[_index]]
- [[Tasks Route]]
