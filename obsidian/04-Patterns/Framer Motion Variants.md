---
tags: [pattern]
---

# Framer Motion Variants

> Every new React component must use shared Framer Motion variants from `frontend/src/utils/animations/variants.ts` — never ad-hoc spring values.

## When to apply

Every new component in `frontend/src/`.

## The pattern

```tsx
import { motion } from "framer-motion";
import { staggerCascade } from "@/utils/animations/variants";

<motion.div variants={staggerCascade.container} initial="hidden" animate="visible">
    {items.map((item) => (
        <motion.div key={item.id} variants={staggerCascade.item}>...</motion.div>
    ))}
</motion.div>
```

Variant by component type:

| Type | Variant |
|---|---|
| Page / route | `pageEntrance` |
| Grid card | `staggerCascade` |
| Table rows | `listStagger` |
| Modal | `scaleIn` |
| Sliding panel | `slideIn.left/right/bottom` |
| Scroll-triggered | `scrollReveal.*` |
| Interactive card | `createCardHover(primaryRgb)` |

Use spring presets: `spring.snappy`, `spring.bouncy`, `spring.gentle`. Always respect `useReducedMotion()`.

## Don't

- Don't write ad-hoc `transition={{ type: "spring", ... }}` — use the shared presets

## See also

- [[_index]]
