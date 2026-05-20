---
tags: [frontend, animations, a11y]
---

# Reduced Motion

> Always respect `prefers-reduced-motion` (and the in-app `reducedMotion` setting in [[uiStore]]) — skip or shorten animations when true.

## Source

- `frontend/src/utils/animations/hooks.ts` (`useReducedMotion`)
- `frontend/src/utils/animations/variants.ts` (`reducedMotionPage`)

## How it works

```ts
export function useReducedMotion(): boolean {
  const storeReduced = useUIStore((s) => s.reducedMotion);
  return storeReduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const reducedMotionPage: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit:    { opacity: 0, transition: { duration: 0 } },
};
```

Pattern: pick the variant based on the hook, not the value:

```tsx
const reduced = useReducedMotion();
const variants = reduced ? reducedMotionPage : pageEntrance;
```

Required for every animated route/component.

## Depends on

- [[Animation Hooks]]
- [[uiStore]]

## Used by

- All page components in `frontend/src/pages/`
