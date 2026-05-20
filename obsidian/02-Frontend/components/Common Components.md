---
tags: [frontend, components, common]
---

# Common Components

> Shared primitives used across pages.

## Source

- `frontend/src/components/common/`

## Members

- [[ZoomAwareSelect]] — drop-in replacement for MUI `<Select>` that respects `uiScale`
- [[ZoomAwareAutocomplete]] — same idea for `<Autocomplete>`
- `ConfirmDialog.tsx` / `DestructiveConfirmDialog.tsx` — yes/no modals (the destructive variant requires typed confirmation)
- `EmptyState.tsx`, `ErrorState.tsx`, `LoadingOverlay.tsx` — page-level placeholders
- `MetricRow.tsx`, `SectionHeader.tsx`, `StatusDot.tsx`, `StatusChip.tsx` — small labeled atoms
- `SaveIndicator.tsx` — debounced "Saved" pulse near forms
- `CoinIcon.tsx` — ticker icon resolver
- `ShimmerSkeleton.tsx` — stable-keyed loading skeleton (Biome `noArrayIndexKey`)
- `ThemeSelector.tsx`, `ZoomIndicator.tsx` — chrome controls
- `ErrorBoundary.tsx` — React error boundary, also wired into [[Sentry Frontend]]
- `PageTransition.tsx` — wraps routed pages in [[pageEntrance]]
- `IntervalPicker.tsx` — recurring schedule picker for tasks

## See also

- [[_index]]
- [[CSS Zoom Handling]]
