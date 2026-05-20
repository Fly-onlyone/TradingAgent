---
tags: [frontend, animations]
---

# pageEntrance

> The canonical entry animation for top-level route components — fade + lift + scale.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
initial: { opacity: 0, y: 30, scale: 0.98 }
animate: { opacity: 1, y: 0, scale: 1, transition: spring stiffness:300 damping:30 }
exit:    { opacity: 0, y: -20, transition: duration 0.15 easeIn }
```

The `exit` is a tween (not spring) so route changes feel responsive — the new page can come in while the old one is still leaving.

```tsx
import { motion } from "framer-motion";
import { pageEntrance } from "@/utils/animations/variants";

<motion.div variants={pageEntrance} initial="initial" animate="animate" exit="exit">
  ...
</motion.div>
```

Use [[pageInstant]] for very lightweight pages where a fade is enough.

## Depends on

- [[Spring Configs]]

## See also

- [[Reduced Motion]]
- [[tabSwitch]]
