---
tags: [frontend, components, moc]
---

# Components MOC

> Map of `frontend/src/components/` grouped by domain.

## Source

- `frontend/src/components/`

## Groups

- [[Agent Components]] — chat, sessions, tool calls, decisions
- [[Trading Components]] — live market, tickers, holdings, positions
- [[Trades Components]] — trade history table, filters, summaries
- [[Chart Components]] — PnL, equity, performance visualizations
- [[Layout Components]] — [[AppShell]], [[Sidebar]], header, bottom nav, notifications
- [[Effects Components]] — background visuals, magnetic hovers, rolling digits
- [[Common Components]] — shared primitives, including [[ZoomAwareSelect]] / [[ZoomAwareAutocomplete]]
- [[Settings Components]] — notification provider config, Apprise channels
- [[Tasks Components]] — task scheduler UI

## Conventions

- Every new component should use [[Framer Motion Variants]] (e.g. [[staggerCascade]], [[scaleIn]]) and honor [[Reduced Motion]].
- Never use plain MUI `<Select>` or `anchorEl`-based `<Menu>` — see [[CSS Zoom Handling]].
- snake_case API payloads are mapped to camelCase via per-endpoint transformers.

## See also

- [[CSS Zoom Handling]]
- [[MUI Theme]]
