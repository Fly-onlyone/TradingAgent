---
tags: [frontend, animations]
---

# Spring Configs

> Three canonical Framer Motion spring transitions — `snappy`, `bouncy`, `gentle`. Reuse these everywhere instead of inventing new spring values.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
export const spring = {
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  bouncy: { type: "spring", stiffness: 300, damping: 20, mass: 0.8 },
  gentle: { type: "spring", stiffness: 200, damping: 25 },
};
```

- **`snappy`** — quick, no overshoot. Default for buttons, hover/tap, list items, tab switches. Used implicitly by [[staggerCascade]], [[listStagger]], [[slideIn]], [[createCardHover]].
- **`bouncy`** — soft overshoot. Modals/dialogs ([[scaleIn]]), playful confirmations.
- **`gentle`** — slow settle. Single-element entries like [[fadeInUp]].

Always respect [[Reduced Motion]] — when the user prefers reduced motion, swap to `reducedMotionPage` or shorten/skip the animation.

## Used by

- All variants in [[_index]]

## See also

- [[Framer Motion Variants]]
