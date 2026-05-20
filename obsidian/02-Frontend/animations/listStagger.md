---
tags: [frontend, animations]
---

# listStagger

> Faster, horizontal version of [[staggerCascade]] — table rows slide in from the left at 30ms intervals.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
container.visible.transition.staggerChildren = 0.03
item.hidden  = { opacity: 0, x: -20 }
item.visible = { opacity: 1, x: 0, transition: spring 400/30 }
```

30ms stagger keeps 50-row tables feeling responsive instead of slideshow-y. The horizontal x-axis suits row-based layouts where vertical movement would fight the table's natural rhythm.

```tsx
import { motion } from "framer-motion";
import { listStagger } from "@/utils/animations/variants";

<motion.tbody variants={listStagger.container} initial="hidden" animate="visible">
  {rows.map((row) => (
    <motion.tr key={row.id} variants={listStagger.item}>...</motion.tr>
  ))}
</motion.tbody>
```

## Depends on

- [[Spring Configs]]

## See also

- [[staggerCascade]]
