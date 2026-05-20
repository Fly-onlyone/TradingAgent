---
tags: [frontend, animations]
---

# scaleIn

> Modal/dialog entry — soft `0.85 → 1` scale with a bouncy spring.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
initial: { opacity: 0, scale: 0.85 }
animate: { opacity: 1, scale: 1,  transition: spring 300/20 mass:0.8 }
exit:    { opacity: 0, scale: 0.9, transition: { duration: 0.12 } }
```

The bouncy spring (mass 0.8) gives a confident pop without being cartoonish. Exit is a fast tween — close should never feel reluctant.

```tsx
import { motion } from "framer-motion";
import { scaleIn } from "@/utils/animations/variants";

<motion.div variants={scaleIn} initial="initial" animate="animate" exit="exit">
  <Dialog>...</Dialog>
</motion.div>
```

For tabs inside a modal, layer [[tabSwitch]] inside this container.

## Depends on

- [[Spring Configs]]

## See also

- [[tabSwitch]]
