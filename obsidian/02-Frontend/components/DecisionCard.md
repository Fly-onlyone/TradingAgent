---
tags: [frontend, components, agent]
---

# DecisionCard

> Renders an `AgentDecision` (buy/sell/hold/wait) as a card with action chip, confidence bar, rationale, and optional execute button.

## Source

- `frontend/src/components/agent/DecisionCard.tsx`

## How it works

Reads `AgentDecision` from [[useAgentSocket]]. Picks a styled config per action
(`buy` → green TrendingUp, `sell` → red TrendingDown, `hold` → blue PauseCircle,
`wait` → amber HourglassEmpty). Confidence is shown as a `LinearProgress`. When
`onExecute` is provided, an action button submits the decision via the trade
endpoints and disables itself while `isExecuting`.

## Depends on

- [[useAgentSocket]]
- [[Framer Motion Variants]] (entry animation)

## Used by

- [[Agent Route]]
- `DecisionHistoryPanel.tsx`
- [[Dashboard Route]]

## See also

- [[Agent Components]]
- [[Trading Decision Flow]]
