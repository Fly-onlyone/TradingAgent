---
tags: [frontend, animations]
---

# staggerCascade

> Container + item variants for grid/card lists — children cascade in at 80ms intervals with a `y+scale` spring.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
container.visible.transition.staggerChildren = 0.08
item.hidden  = { opacity: 0, y: 40, scale: 0.95 }
item.visible = { opacity: 1, y: 0,  scale: 1, transition: spring 400/30 }
```

Use on grids of cards where each card should announce its arrival individually. The cascade is slower than [[listStagger]] (0.08s vs 0.03s) so it reads as a deliberate reveal rather than a fast list flush.

```tsx
import { motion } from "framer-motion";
import { staggerCascade } from "@/utils/animations/variants";

<motion.div variants={staggerCascade.container} initial="hidden" animate="visible">
  {items.map((it) => (
    <motion.div key={it.id} variants={staggerCascade.item}>...</motion.div>
  ))}
</motion.div>
```

## Depends on

- [[Spring Configs]]

## See also

- [[listStagger]]
